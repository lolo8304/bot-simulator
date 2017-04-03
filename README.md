# botsociety-to-JSON
A small tool to extract botsociety bots to JSON

# How to use
ATTENTION - only works in edit mode

Copy paste the following code into chrome console when on a bot project page. 
- see [Javascript](chrome/create-JSON-from-bot.js)
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

# examples
- [example on botsociety.io](https://botsociety.io/s/58deaf67cdf2eb63000d4fa3?b=58deb1a4cdf2eb63000d4fa6)
- generated files see [examples](examples/)
