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
var port = process.env.port || process.env.PORT || 3979;

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

var example = c.conversation().object();
var rootDialog = example.conversation[0];

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
          if (thenRefDialog) {
            var dialog = findDialog(thenRefDialog);
            if (dialog) {
              console.log("answered with "+entity+", but will use Dialog named "+thenRefDialog);
              return dialog;
            } else {
              console.log("dialog <"+dialog+"> not found as referenced dialog");
            }
          }
          var thenRefIndex = currentDialog.answer[i].thenRef;
          if (i != thenRefIndex) {
            console.log("answered with "+entity+", but will use "+currentDialog.answer[thenRefIndex].text);
          }
          return {conversations: currentDialog.answer[thenRefIndex].then, index: 0};
        }
      }
    }
    return undefined;
  }
}

var currentDialog;

bot.dialog('/', [
  function (session, args, next) {
    if (!args) {
      currentDialog = startDialog(session, example.conversation, 0);
    } else {
      currentDialog = startDialog(session, args.conversations, args.index);
    }
  },
  function (session, results, next) {
      var conversations = findNextConversations(currentDialog, results);
      if (conversations) {
        session.replaceDialog("/", conversations);
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

