# botsociety.io designed Bot to real functional Bot
A small tool to extract botsociety bots to JSON and run it as a real chat-bot using microsoft bot-framework.
In Botsociety it is not possible to test the different Connectors and real interaction with small devices.

## Overall description
- clone / fork git repo locally
- create / edit botsociety.io design
- optimized botsociety.io texts with some [$ markers](#how-to-add-markers-in-texts)
- run script in Chrome in edit mode in Botsociety.io
- copy  output in console (including image URLs to botsociety.io images)
- register Bot as Microsoft Bot framework (APP-ID + password)
- paste ouput as inner part of [conversation-simulation.js](conversation-simulation.js)
- start chat-bot using Emulator and other connectors

## How to use
ATTENTION - only works in edit mode in botsociety.io

Copy paste the following code into chrome console when on a bot project page. 
- see [Javascript](chrome/create-JSON-from-bot.js)
- Goto "More tools" / "Developer tools"
- Source tab
- subtab "Snippets"
- new snippet
- paste
- use "run" in context sensitive menu to run it

## How to configure Generator

following options are able to control the generation

DEBUG = true | false
- default = false
- if true, many console.log(...) are used to be able to inspect the real objects from botsociety.io

GENERATE_LABELS
- default = false, not needed for simulation
- true: will generate an addition console.entry with all texts captured in the dialogs
- use formatted information in all text fields as $.dialog-name.label-name - see [$ markers](#how-to-add-markers-in-texts)
- console entry can be used directly as locale.json file for localization

## How to add $ markers in texts 
Pain

To have a fully functional all-the-time working botsociety.io design you have to invest a lot of time and especially if you want to use the same reactions on all possible "choices".
**Important:** Markers are not really needed to have a functional demo. All choices with no further answers will proceed with 1st non empty answer.

Solution: use $ markers in texts.

1. **$.dialog-name.label-name**: use label markers in titles
2. **$=index**: in choices or quick-replies to use the same answer as index no
3. **$.dialog**: in choices or quick-replies to start 1st message of existing dialog (see no. 1)

examples
- "What is your favorite colour?": standard
- "What is your favorite colour? **$.Intro.willkommen**": additional label and dialog marker
- "Why do you like Green? **$.Intro.title**": additional label and dialog marker

![ScreenShot](images/marker.dialog.label.png)
- choices "blue|red|green": standard answers
- choices "blue **$=1**|red|green **$=1**": answers marked on 1st and 3rd answer to use the 2nd answer (index 1)

![ScreenShot](images/marker.choices.reference.png)
- choices "no I am happy|yes **$.Intro**": answer no 2 is opening dialog "Intro"

![ScreenShot](images/markers.dialog.link.png)


## How to configure bot-framework
- register new Bot Microsoft Botframework https://dev.botframework.com/
- copy [_env](_env) file to .env locally - do not share 
- copy APP-ID and Password from settings into .env
- paste output from console into [converstation-simulation.js](converstation-simulation.js)


## examples
- [example on botsociety.io](https://botsociety.io/s/58deaf67cdf2eb63000d4fa3?b=58deb1a4cdf2eb63000d4fa6)
- generated files see [examples](examples/)
