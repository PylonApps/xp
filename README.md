# Pylon XP system
To use this module in [Pylon](https://pylon.bot/), go to the editor, create a new file called `xp.ts` and then put the following in your `main.ts`:
```ts
import './xp';
```

This module requires an [fAPI](https://fapi.dreadful.tech/) account for image generation.
Please refer to the [ImageScript documentation](https://imagescript.dreadful.tech/#getting-started) on how to create one.  
If you have an fAPI access token, expose it in your `main.ts` as follows: `global.FAPI_TOKEN = '<your token here>';`.  
An example `main.ts` would look like this:
```ts
global.FAPI_TOKEN = 'f03bc4bd35177305bc43cf3abb072436';
import './xp';
```