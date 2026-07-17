# ARISE

A personal, Solo Leveling-inspired "System" for real life: five hobbies,
daily/weekly/side quests, XP, levels, five attributes, hunter ranks E→S,
streaks, achievements, and equippable titles.

Built with Expo + React Native + TypeScript. All data stays on-device.

See [DESIGN.md](./DESIGN.md) for the full game design.

## Run it

```bash
npm install
npx expo start
```

Then scan the QR code with the **Expo Go** app ([iOS](https://apps.apple.com/app/expo-go/id982107779) / [Android](https://play.google.com/store/apps/details?id=host.exp.exponent)).
Press `w` to preview in a web browser instead.

## Project layout

```
src/
  app/            expo-router screens (file = route)
    (tabs)/       Status · Quests · Achievements · Settings
  components/     System UI pieces (panels, bars, quest cards, pop-ups)
  data/           quest + achievement definitions (edit these to tune the game)
  lib/            pure logic: dates, XP curves, ranks, streak math
  store/          zustand store persisted to AsyncStorage
```
