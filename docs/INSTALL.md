# Install (about 10 minutes, once)

You need three things on your computer. After that you only talk to Claude.

## 1. Claude desktop app
Download it from https://claude.ai/download and sign in. Making a book needs the **Code** tab, which comes with a paid plan (Pro or higher).

On Windows the app may ask you to install **Git for Windows** the first time you open the Code tab. Say yes and follow the prompts. It is also needed in step 3.

## 2. Node.js (free)
Go to https://nodejs.org, click the big **LTS** button, open the downloaded file and click Next until it's done. Then close and reopen the Claude app.

You can skip this step: in step 4, Claude notices when Node.js is missing and offers to install it for you.

## 3. Add the photobook plugin
Open the Claude app, go to the **Code** tab, open any folder (for example Documents), and type these two lines in the message box, one at a time:

```
/plugin marketplace add arnegold/photobook-maker
```
```
/plugin install photobook@photobook-maker
```

Then close and reopen the app.

If the app does not accept `/plugin`, click the **+** next to the message box and look for **Plugins**. Or ask whoever sent you this link to help. It takes one minute in a terminal:

```
npx @anthropic-ai/claude-code plugin marketplace add arnegold/photobook-maker
npx @anthropic-ai/claude-code plugin install photobook@photobook-maker --scope user
```

**Without GitHub:** download the project as a ZIP and unzip it, for example to `Documents\photobook-maker`. Then use that folder in the first line instead: `/plugin marketplace add C:\Users\<you>\Documents\photobook-maker`.

## 4. Make a book
In the Code tab, open your Documents folder and type:

> make me a photobook

Claude asks what kind of book you want and suggests a printing service. Then it asks where your photos are and opens a page where you pick your favourites. Your photos are only read, never changed, and nothing is uploaded.

To continue later, open the same folder and say "let's continue my photo book".

## Updating
Type `/plugin` and update **photobook**, or ask Claude to "update the photobook plugin".
