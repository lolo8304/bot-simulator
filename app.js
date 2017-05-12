/*-----------------------------------------------------------------------------
A simple echo bot for the Microsoft Bot Framework.
-----------------------------------------------------------------------------*/

var builder = require('./core/');
var restify = require('restify');
var request = require('request');
require('dotenv').config();
var _ = require('lodash');
var moment = require('moment');

var c = require("./conversation-simulation");

// Setup Restify Server
var server = restify.createServer();
var port = process.env.port || process.env.PORT || 3978;

server.listen(port, function () {
  console.log('%s listening to %s', server.name, server.url);
});

// Create chat connector for communicating with the Bot Framework Service
var connector = new builder.ChatConnector({
  appId: process.env.MICROSOFT_APP_ID,
  appPassword: process.env.MICROSOFT_APP_PASSWORD
});
// This line MUST appear before any route declaration such as the one below
server.use(restify.bodyParser());

// Listen for messages from users
server.post('/api/messages', connector.listen());

var bot = new builder.UniversalBot(connector);

var _db = {};
var examples = c.conversation().object();
var example = examples[0];
for (var i = 0; i < examples.length; ++i) {
  addBotExample(examples[i]);
}

function addBotExample(exampleToLoad) {
  _db[exampleToLoad.bot.conversationId]= {
    conversation: exampleToLoad.conversation,
    botdata: exampleToLoad.bot,
    messages: prepareConversations(exampleToLoad.conversation, {})
  };
}

function prepareConversations(conversations, messages) {
  for (var i = 0; i < conversations.length; ++i) {
    var c = conversations[i];
    messages[c.id] = {
      current: c,
      conversations: conversations,
      index: i
    }
    if (c.answer) {
      for (var j = 0; j < c.answer.length; ++j) {
        var a = c.answer[j];
        prepareConversations(a.then, messages);
      }
    }
  }
  return messages;
}

var fs = require('fs');

function replaceEnvVariable(res, contents, variable) {
  if (!process.env[variable]) {
    res.status(400);
    res.send(variable+" not defined as env variable");
    res.end();
    return undefined;
  }
  return contents.replace("$"+variable, process.env[variable]);
}

server.get('/', function (req, res, next) {
  var contents = fs.readFileSync('./index.html', 'utf8');
  contents = replaceEnvVariable(res, contents, "SKYPE_BOT_ID");
  if (!contents) return;
  contents = replaceEnvVariable(res, contents, "MICROSOFT_APP_NAME");
  if (!contents) return;
  contents = replaceEnvVariable(res, contents, "MICROSOFT_WEBCHAT_ID");
  if (!contents) return;
  res.setHeader('content-type', 'text/html');
  res.end(new Buffer(contents));
});

server.get('/chrome-botsociety-script.js', function (req, res, next) {
  var contents = fs.readFileSync('./chrome/create-JSON-from-bot.js', 'utf8');
  contents = replaceEnvVariable(res, contents, "BOT_DOMAIN_URL");
  if (!contents) return;
  res.setHeader('content-type', 'application/javascript');
  res.end(new Buffer(contents));
});


/** GET conversations stored in botly */

server.get('/conversations', function (req, res, next) {
  res.send(_db);
  return next();
});

server.use(
  function crossOrigin(req,res,next){
    res.header('Access-Control-Allow-Origin', "*");
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    return next();
  }
);

server.post('/conversations/:conversationId', function (req, res, next) {
  var data = JSON.parse(decodeURIComponent(req.body));
  _db[req.params.conversationId]= {
    conversation: data.conversation,
    botdata: data.bot,
    messages: prepareConversations(data.conversation, {})
  };
  res.status(201);
  res.send("{ 'status' : 'ok'}");
  res.end();
});
server.get('/conversations/:conversationId', function (req, res, next) {
  res.send(_db[req.params.conversationId]);
  res.end();
});



bot.on('conversationUpdate', function (message) {
   // Check for group conversations
      // Send a hello message when bot is added
      if (message.membersAdded) {
          message.membersAdded.forEach(function (identity) {
              if (identity.id != message.address.bot.id) {
                  var name = identity.name ? identity.name : "yall";
                  if (message.address.conversation.isGroup) {
                    name = "yall";
                  }
                  var reply = new builder.Message()
                          .address(message.address)
                          .text("Hallo %s.\n\nWe are all auto generated test-bots from https://botsociety.io.\n\nUse **start list** to see my colleagues.\n\nHave fun.", name);
                  bot.send(reply);
              }
          });
      }
});


function findDialog(session, dialogName, conversations) {
  if (!conversations) {
    conversations = _db[session.userData.conversationId].conversation;
  }
  for (var i = 0; i < conversations.length; ++i) {
    if (conversations[i].dialog === dialogName) {
      return {conversations: conversations, index: i}
    }
    for (var j = 0; j < conversations[i].answer.length; ++j) {
      var dialog = findDialog(session, dialogName, conversations[i].answer[j].then);
      if (dialog) { return dialog; }
    }
  }
  return null;
}

function findFirstNonEmptyAnswersNotEnitityIndex(currentDialog, entity) {
  //search for first non-empty then[] with same entity - carousel multi options
  for (var i = 0; i < currentDialog.answer.length; ++i) {
    if (currentDialog.answer[i].text === entity && currentDialog.answer[i].then.length > 0) {
      return i
    }
  }
  // fallback - search for any entry
  for (var i = 0; i < currentDialog.answer.length; ++i) {
    if (currentDialog.answer[i].then.length > 0) {
      return i
    }
  }
  return null;
}


function findNextConversations(session, currentDialogObject, results) {
  var currentDialog = currentDialogObject.current
  if (currentDialog.type == "prompt") {
    //next in same list of conversations
    return {conversations: currentDialogObject.conversations, index: currentDialogObject.index+1};
  } else {
    if (results.response) {
      var entity = results.response.entity;

      for (var i = 0; i < currentDialog.answer.length; ++i) {
        if (currentDialog.answer[i].text === entity) {
          //thenRef Index is used with pattern $=? to reuse existing trees to not copy
          var thenRefDialog = currentDialog.answer[i].thenDialog;
          var thenRefIndex = currentDialog.answer[i].thenRef;
          if (thenRefDialog) {
            var dialog = findDialog(session, thenRefDialog);
            if (dialog) {
              console.log("*** answered with <"+entity+">, but will use Dialog named <"+thenRefDialog+">");
              return dialog;
            } else {
              console.log("*** dialog <"+dialog+"> not found as referenced dialog");
            }
          }
          if (i != thenRefIndex) {
            console.log("*** answered with <"+entity+">, but will use <"+currentDialog.answer[thenRefIndex].text+">");
          } else {
            //no special markers defined. if no then[] search for first NON-empty then[] in same conversations
            if (currentDialog.answer[thenRefIndex].then.length == 0) {
                var idx = findFirstNonEmptyAnswersNotEnitityIndex(currentDialog, entity);
                if (idx) {
                  console.log("*** answered with <"+entity+">, but will use 1st non empty answer <"+currentDialog.answer[idx].text+">");
                  return{conversations: currentDialog.answer[idx].then, index: 0};
                }
            }
          }
          return {conversations: currentDialog.answer[thenRefIndex].then, index: 0};
        }
      }
    }
    return undefined;
  }
}


function startList(session) {
  var keys = [];
  for (var key in _db) {
    if (_db.hasOwnProperty(key) && _db[key]) {
      keys.push(key);
    }
  }
  if (keys.length > 0) {
    session.send("The following demo bots are installed");
    var msg = new builder.Message(session);
    msg.attachmentLayout(builder.AttachmentLayout.carousel)
    for (var key in _db) {
      if (_db.hasOwnProperty(key)) {
        var botdata = _db[key].botdata;
        var card = new builder.HeroCard(session)
            .text("Hi - my name is %s",botdata.botname)
            .subtitle(botdata.fans+", category: "+botdata.category)
            .images([
                  builder.CardImage.create(session, botdata.imageURL)
            ])
            .buttons([
                  builder.CardAction.imBack(session, "start "+key, "start Bot"),
                  builder.CardAction.imBack(session, "remove "+key, "remove Bot"),
                  builder.CardAction.openUrl(session, botdata.previewURL, 'botsociety.io')
            ]);
        msg.addAttachment(card);
      }
    }
    session.send(msg);
  } else {
    session.send("no bots are installed. Install them via 'chrome plugin' from https://botsociety.io");
  }
  session.userData.conversationId = null;
  session.endDialog();
}

bot.dialog('/', [
  function (session, args, next) {
    if (!args) {
      var message = session.message.text.toLowerCase();
      if (message == "start") {
        session.userData.conversationId = example.bot.conversationId;
        session.userData.conversationId = example.bot.conversationId;
      } else if (message == "start list") {
          startList(session);
          return;
      } else if (message.indexOf("start ") >= 0) {
        var idx = message.indexOf("start ");
        session.userData.conversationId = message.substring(idx+6).trim();
      } else if (message.indexOf("remove ") >= 0) {
        var idx = message.indexOf("remove ");
        var conversationId = message.substring(idx+6).trim();
        session.userData.conversationId = null;
        _db[conversationId] = null;
        delete _db[conversationId];
        session.endDialog();
        return;
      } else {
        session.endDialog();
        return;
      }
      if (!session.userData.conversationId) {
        session.send("no bot is installed. use **start list** to get them");
        session.endDialog();
        return;
      }
      if (!session.userData.conversationId || !_db[session.userData.conversationId]) {
        console.log("no conversationId found - using default "+example.bot.conversationId);
        session.userData.conversationId = example.bot.conversationId;
      }
      var botdata = _db[session.userData.conversationId].botdata;
      var card = new builder.HeroCard(session)
          .text("Hi - my name is %s, a simulated bot from botsociety.io",botdata.botname)
          .subtitle(botdata.fans+", category: "+botdata.category)
          .images([
                builder.CardImage.create(session, botdata.imageURL)
          ]);
      var msg = new builder.Message(session).addAttachment(card);
      session.send(msg);
      startDialog(session, _db[session.userData.conversationId].conversation, 0);
    } else if (args.action == "SetCarouselAction") {
      //forward dialog action response of carousel to response based on answer
      //answer has format "SetCarouselAction <button>"
      next({response: { entity: args.data.substring("SetCarouselAction".length+1)}});
    } else {
      var currentDialog = _db[session.userData.conversationId].messages[session.userData.currentMessage];
      startDialog(session, currentDialog.conversations, currentDialog.index);
    }
  },
  function (session, results, next) {
    var currentDialog = _db[session.userData.conversationId].messages[session.userData.currentMessage];
    var conversations = findNextConversations(session, currentDialog, results);
    if (conversations && conversations.index < conversations.conversations.length) {
      session.userData.currentMessage = conversations.conversations[conversations.index].id;
      session.replaceDialog("/", conversations.conversations[conversations.index].id);
    } else {
      session.endDialog();
    }
  }
])
.cancelAction('/', "OK - I cancel it. Bye. Use **start list** to get back.", { matches: /(stop|start|hallo|bye|goodbye|start .*|tschüss)/i })
.beginDialogAction('SetCarouselAction', '/', { matches: /SetCarouselAction.*/i });


function startDialog(session, conversations, i) {
    var lastDialogObject = runDialog(session, conversations, i);
    session.sendBatch();
    return lastDialogObject;
}

function runDialog(session, conversations, i) {
  var nextDialog = conversations[i];
  if (!nextDialog) { return; }
  session.userData.currentMessage = nextDialog.id;

  if (nextDialog.type === "text") {
    session.send(nextDialog.text);
    return runDialog(session, conversations, i+1);
  } else if (nextDialog.type === "images") {
      var card = new builder.HeroCard(session)
          .text(nextDialog.text)
          .images([
                builder.CardImage.create(session, nextDialog.url)
          ]);
      var msg = new builder.Message(session).addAttachment(card);
      session.send(msg);
      return runDialog(session, conversations, i+1);
  } else if (nextDialog.type === "tbuttons") {
      var msg = new builder.Message(session);
      for (var i = 0; i < nextDialog.carousel.length; ++i) {
        var nextDialogCarousel = nextDialog.carousel[i];
        var card = new builder.HeroCard(session)
            .text(nextDialogCarousel.text)
            .subtitle(nextDialogCarousel.subtitle)
            .images([
                  builder.CardImage.create(session, nextDialogCarousel.imageURL)
            ]);
        var buttons = [];
        for (var j = 0; j < nextDialogCarousel.choices.length; ++j) {
          var nextChoice = nextDialogCarousel.choices[j];
          buttons.push(
                  builder.CardAction.
                  dialogAction(session, "SetCarouselAction", "SetCarouselAction "+nextChoice, nextChoice)
          );
        }
        card.buttons(buttons);
        msg.attachmentLayout(builder.AttachmentLayout.carousel);
        msg.addAttachment(card);
      }
      session.send(msg);
  } else if (nextDialog.type === "buttons") {
    builder.Prompts.choice(
      session, nextDialog.text,
      nextDialog.choices, {listStyle: builder.ListStyle["button"]});
  } else if (nextDialog.type === "prompt") {
    builder.Prompts.text(session,nextDialog.text);
  } else if (nextDialog.type === "quickreplies") {
    builder.Prompts.choice(
      session, "",
      nextDialog.choices, {listStyle: builder.ListStyle["button"]});
  }
  return {
    current: nextDialog,
    conversations: conversations,
    index: i};
}
