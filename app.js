/*-----------------------------------------------------------------------------
A simple echo bot for the Microsoft Bot Framework. 
-----------------------------------------------------------------------------*/

var builder = require('./core/');
var restify = require('restify');
var request = require('request');
require('dotenv').config();
var _ = require('lodash');
var moment = require('moment');

var c = require("./converstation-simulation");

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

// Listen for messages from users 
server.post('/api/messages', connector.listen());

var bot = new builder.UniversalBot(connector);

var conversations_db = {};
var example = c.conversation().object();
var rootDialog = example.conversation[0];
var botdata = example.bot;
conversations_db[example.bot.conversationId]= example;

var messages = {};
prepareConversations(example.conversation);

function prepareConversations(conversations) {
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
        prepareConversations(a.then);
      }
    }
  }
}

/** GET conversations stored in botly */

server.get('/conversations', function (req, res, next) {
  res.contentType("application/json");
  res.send(JSON.stringify(conversations_db));
  return next();
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
                          .text("Hallo %s. My Name is %s and type **start** to talk to me.\n\nI am an auto generated bot from %s", name, botdata.botname, botdata.previewURL);
                  bot.send(reply);
              }
          });
      }
});


function findDialog(dialogName, conversations) {
  if (!conversations) {
    conversations = example.conversation;
  }
  for (var i = 0; i < conversations.length; ++i) {
    if (conversations[i].dialog === dialogName) {
      return {conversations: conversations, index: i}
    }
    for (var j = 0; j < conversations[i].answer.length; ++j) {
      var dialog = findDialog(dialogName, conversations[i].answer[j].then);
      if (dialog) { return dialog; }
    }
  }
  return null;
}

function findFirstNonEmptyAnswersNotEnitityIndex(currentDialog, entity) {
  //search for first non-empty then[]
  for (var i = 0; i < currentDialog.answer.length; ++i) {    
    if (currentDialog.answer[i].text != entity && currentDialog.answer[i].then.length > 0) {
      return i
    }
  }
  return null;
}


function findNextConversations(currentDialogObject, results) {
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
            var dialog = findDialog(thenRefDialog);
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

//var currentDialog;

bot.dialog('/', [
  function (session, args, next) {
    if (!args) {
      var card = new builder.HeroCard(session)
          .text("Hi - my name is %s",botdata.botname)
          .subtitle(botdata.fans+", category: "+botdata.category)
          .images([
                builder.CardImage.create(session, botdata.imageURL)
          ]);
      var msg = new builder.Message(session).addAttachment(card);
      session.send(msg);      
      startDialog(session, example.conversation, 0);
    } else {
      var currentDialog = messages[session.userData.currentMessage];
      startDialog(session, currentDialog.conversations, currentDialog.index);
    }
  },
  function (session, results, next) {
    var currentDialog = messages[session.userData.currentMessage];
    var conversations = findNextConversations(currentDialog, results);
    if (conversations) {
      session.userData.currentMessage = conversations.conversations[conversations.index].id;
      session.replaceDialog("/", conversations.conversations[conversations.index].id);
    } else {
      session.endDialog();
    }
  }
]);

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

