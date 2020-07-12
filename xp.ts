const rankCommands = new discord.command.CommandGroup({ defaultPrefix: '!' });

const xpToLevel = (xp: number) => Math.floor(Math.sqrt(xp / 100));
const levelToXp = (level: number) => level ** 2 * 100;
const randomBetween = (min: number, max: number) =>
  Math.round(Math.random() * (max - min) + min);

const xpKV = new pylon.KVNamespace('xp');
const cooldownKV = new pylon.KVNamespace('xpCooldowns');

const sendRankCard = async (
  message: discord.Message,
  user: discord.User,
  xp: number,
  levelUp: boolean = false
) => {
  const code = `
  const image = Image.new(512, 170);

  avatar = Image.load(avatar).cropCircle();
  if (avatar.width !== 128)
    avatar.resize(128, 128);

  const font = Image.loadFont('BalooExtraBold');

  tag = Image.renderText(52, 0xfafbfcff, font, tag);
  if(tag.width > image.width - 158)
    tag = tag.resize(image.width - 188, Image.RESIZE_AUTO);

  const averageColor = avatar.averageColor();

  const f = (a,b) => {
    if (seed % (a ^ b) > (a ^ b) * 0.96) return averageColor << 8 | 0xff;
    return 0xff;
  };

  image.fill(f);

  const xp_text = Image.renderText(38, 0xfafbfcff, font, \`\${xp}/\${next} XP\`);
  const level_text = Image.renderText(115, 0xfafbfcff, font, \`LEVEL \${level}\`);

  image.composite(avatar, 20, 20);
  image.composite(tag, 45 + avatar.width, 5);
  image.composite(level_text, 45 + avatar.width, tag.height - 15);
  image.composite(xp_text, image.width - 5 - xp_text.width, image.height - 35);
  image.drawBox(0, image.height - 4, Math.floor(xp / next * image.width), 4, 0xfbae40ff);
  image.drawBox(Math.floor((xp - prev) / (next - prev) * image.width), image.height - 4, image.width - Math.floor((xp - prev) / (next - prev) * image.width), 4, 0x6d6e71ff);
  `;

  return message.reply(async () => {
    const request = await fetch('https://fapi.wrmsr.io/image_script', {
      body: JSON.stringify({
        args: {
          text: code,
          inject: {
            avatar: user.getAvatarUrl(discord.ImageType.PNG),
            tag: user.getTag(),
            xp,
            level: xpToLevel(xp),
            next: levelToXp(xpToLevel(xp) + 1),
            prev: levelToXp(xpToLevel(xp) - 1),
            seed: (parseInt(user.id) % 1000) + 5
          }
        }
      }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${FAPI_TOKEN}`
      },
      method: 'POST'
    });

    if (!request.ok)
      return message.reply(
        `:x: Something went wrong generating the rank card:\n${await request.text()}`
      );

    return {
      content: levelUp
        ? `**${message.author?.getTag()}** just leveled up!`
        : '',
      attachments: [{ name: 'rank.png', data: await request.arrayBuffer() }]
    } as discord.Message.IOutgoingMessageOptions;
  });
};

discord.on(discord.Event.MESSAGE_CREATE, async (message: discord.Message) => {
  if (!message.author || message.author.bot) return;
  if (await cooldownKV.get<boolean>(message.author.id)) return;
  await cooldownKV.put(message.author.id, true, {
    ttl: randomBetween(45000, 75000) // cooldown for gaining new xp: between 45 and 75 seconds
  });

  const oldXP = (await xpKV.get<number>(message.author.id)) || 0;
  const oldLevel = xpToLevel(oldXP);

  const newXP = oldXP + randomBetween(25, 35); // xp to add: between 25 and 35
  const newLevel = xpToLevel(newXP);

  await xpKV.put(message.author.id, newXP, { ttl: 1000 * 60 * 60 * 24 * 30 }); // xp will reset after 30 days of inactivity

  if (newLevel > 0 && newLevel > oldLevel)
    await sendRankCard(message, message.author, newXP, true);
});

rankCommands.on(
  { name: 'rank', aliases: ['level'], description: 'Rank card' },
  (args) => ({ user: args.userOptional() }),
  async (message, { user }) => {
    const target = user ?? message.author;

    const xp = (await xpKV.get<number>(target.id)) || 0;
    await sendRankCard(message, target, xp, false);
  }
);

rankCommands.on(
  {
    name: 'top',
    description: 'XP leaderboard'
  },
  () => ({}),
  async (message: discord.Message) => {
    return message.reply(async () => {
      const items = await xpKV.items();

      let top = await Promise.all(
        items
          .sort((a: any, b: any) => (b.value || 0) - (a.value || 0))
          .slice(0, 10)
          .map((entry) =>
            discord.getUser(entry.key).then((user) => ({
              value: entry.value,
              level: xpToLevel(entry.value as number),
              next: levelToXp(xpToLevel(entry.value as number) + 1),
              prev: levelToXp(xpToLevel(entry.value as number) - 1),
              tag: user?.getTag(),
              avatar: user?.getAvatarUrl()
            }))
          )
      );

      const code = `
      top = JSON.parse(top);
      const image = Image.new(700, 888);
      const avatars = Image.loadMultiple(top.map(x => x.avatar));
      const g = (x, y) => Math.sin(x ^ y) / Math.cos(y ^ x) / seed;
      image.fill((x, y) => Image.rgbToColor(g(x, x), g(y, y), g(x, y)));

      avatars.forEach((avatar, index) => {
        if (avatar.width !== 64) avatar.resize(64, 64);
        avatar.cropCircle();
        image.composite(avatar, 20, 15 + (87 * index));
      });

      const font = Image.loadFont('BalooExtraBold');
      top.forEach((user, index) => {
        const tag = Image.renderText(64, 0xfafbfcff, font, user.tag);
        const level = Image.renderText(64, 0xfafbfcff, font, \`LVL \${user.level}\`);

        const xp = Image.renderText(42, 0xd6e0ffff, font, \`\${user.value.toLocaleString()} XP\`);
        if (tag.width > image.width - 35 - 40 - 64 - level.width) tag.resize(image.width - 35 - 40 - 64 - level.width, Image.RESIZE_AUTO);

        image.composite(tag, 20 + 64 + 15, 15 + (87 * index));
        image.composite(xp, image.width - 20 - xp.width, 55 + (87 * index));
        image.composite(level, image.width - 20 - level.width, 9 + (87 * index));
        image.drawBox(image.width - 20 - level.width, 55 + (87 * index),  Math.floor((user.value - user.prev) / (user.next - user.prev) * level.width), 5, 0xF38020ff);
        image.drawBox(image.width - 20 - level.width + Math.floor((user.value - user.prev) / (user.next - user.prev) * level.width), 55 + (87 * index), level.width - Math.floor((user.value - user.prev) / (user.next - user.prev) * level.width), 5, 0x6d6e71ff);
      });`;

      const request = await fetch('https://fapi.wrmsr.io/image_script', {
        body: JSON.stringify({
          args: {
            text: code,
            inject: {
              seed: randomBetween(10, 50),
              top: JSON.stringify(top)
            }
          }
        }),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${FAPI_TOKEN}`
        },
        method: 'POST'
      });

      if (!request.ok)
        return `:x: Something went wrong generating the rank card:\n${await request.text()}`;

      return {
        attachments: [{ name: 'top.png', data: await request.arrayBuffer() }]
      };
    });
  }
);
