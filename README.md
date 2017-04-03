# botsociety-to-JSON
A small tool to extract botsociety bots to JSON

# How to use

Copy paste the following code into chrome console when on a bot project page. 
- see [Javascript](create-JSON-from-bot.js)
- Goto "More tools" / "Developer tools"
- Source tab, 
- subtab "Snippets", 
- + new snippet
- paste
- use "run" in context sensitive menu to run it

# How to configure

following options are able to control the generation

DEBUG = true | false
- if true, many console.log(...) are used to be able to inspect the real objects from botsociety.io

GENERATE_LABELS
- true: will generate an addition console.entry with all texts captured in the dialogs
- use formatted information in all text fields as $.dialog-name.label-name
- console entry can be used directly as locale.json file for localization
