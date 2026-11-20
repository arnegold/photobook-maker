# Install (about 5 minutes, once)

After this you only talk to Claude.

## 1. Claude desktop app
Download it from https://claude.ai/download and sign in. Making a book needs the **Code** tab, which comes with a paid plan (Pro or higher).

On Windows the app may ask you to install **Git for Windows** the first time you open the Code tab. Say yes and follow the prompts.

## 2. Add the photobook plugin
In the **Code** tab, open any folder (for example Documents) and type these two lines in the message box, one at a time:

```
/plugin marketplace add arnegold/photobook-maker
```
```
/plugin install photobook@photobook-maker
```

Then close and reopen the app.

If the app does not accept `/plugin`, click the **+** next to the message box and look for **Plugins**.

## 3. Make a book
In the Code tab, open your Documents folder and type:

> make me a photobook

The first time, Claude spends about a minute setting up its tools (it downloads a private helper, Node.js, that only this plugin uses; nothing else on your computer changes). Then it asks what kind of book you want, suggests a printing service, asks where your photos are and opens a page where you pick your favourites. Your photos are only read, never changed, and nothing is uploaded.

To continue later, open the same folder and say "let's continue my photo book".

## Updating
Type `/plugin` and update **photobook**, or ask Claude to "update the photobook plugin".

## Removing
Remove the plugin with `/plugin`. The helper lives in `%LOCALAPPDATA%\photobook-maker` (Windows) or `~/.photobook-maker` (Mac); delete that folder too.
