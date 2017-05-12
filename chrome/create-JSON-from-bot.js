var ITEMS = {};

// control the execution
var DEBUG = false;
// true = generate language.json file content with all texts and replace with variable based
// in label: use $.<dialog>.<label-name>
var GENERATE_LABELS = false;

// true = install content of bot directly in botframework endpoint
var ADD_CONVERSATION = true;
//test local: start ngrok in command line with your port
//    ngrok http 3979
var ADD_CONVERSATION_URL = "$BOT_DOMAIN_URL"

var botnameDiv=document.querySelectorAll('div[class^="botname"]')[0];
if (!botnameDiv) {
  alert("Please open a conversation in edit or preview mode.");

} else {
var botname = document.querySelectorAll('div[class^="botname"]')[0].innerText;
var fans = document.querySelectorAll('div[class^="fans"]')[0].innerText;
var category = document.querySelectorAll('div[class^="page_category"]')[0].innerText;
var image = document.querySelectorAll('div[class^="profile-picture"]')[0].attributes["data.picture"].nodeValue;
var conversationId = getConversationFromURL(window.location.href);
var serverDomain = window.location.origin;

var previewURL = serverDomain+"/s/"+conversationId;

function getConversationFromURL(url) {
  var paths = url.split('/');
  for (var i = 0; i < paths.length; ++i) {
    if (paths[i] === "conversations") {
      return paths[i+1];
    }
  }
  return "noid";
}

$.getJSON(serverDomain+"/branches/branchesByConversationIdShow?ignoreLoadingBar=true&conversationId=" + conversationId
, function (data) { 
  if (DEBUG) { console.log(data); }
  ITEMS = data;
  done();
});

function createLabelString(labels) {
    var labelsSet = [];
  var buffer = ""
  buffer += "{";
  for (var i = 0; i < labels.length; ++i) {
    if (!labelsSet[labels[i].key]) {
      labelsSet[labels[i].key] = JSON.stringify(labels[i].text);
      buffer += 
        "\t\""
        + labels[i].key 
        + "\" : "
        +JSON.stringify(labels[i].text) + ",";
    }
  }
  buffer += "\"final\" : \"\"";
  buffer += "}";
  return buffer;

}

function done() {

  var ROOT = null;
  for (var _id in ITEMS) {
   
    var node = ITEMS[_id];
    if (DEBUG) { console.log(node); }
    if (node._branches_in.length) {
      if (!ITEMS[node._branches_in[0]]) {
        console.log(node._branches_in[0]);
      }
      if (ITEMS[node._branches_in[0]] != undefined) {
        if (!ITEMS[node._branches_in[0]].childs) {
          ITEMS[node._branches_in[0]].childs = [];
        }
        ITEMS[node._branches_in[0]].childs.push(node);
      }
    }
    else {
      ROOT = node;
    }
  }  
  if (DEBUG) { console.log('ROOT'); }
  if (DEBUG) { console.log(ROOT); }
  var conversation = [];
  var labels = [];
  var dialogs = [];
  addNodeToConversation(conversation, labels, dialogs, ROOT);

  var bot = { "conversationId": conversationId, "botname" : botname, "fans" : fans, "category" : category, "imageURL" : image, "previewURL": previewURL};
  var conversationData = {"bot": bot, "conversation" : conversation};
  console.log(JSON.stringify(conversationData));
  if (ADD_CONVERSATION) {
    $.post(ADD_CONVERSATION_URL+"/conversations/"+conversationId, JSON.stringify(conversationData), function(response) {
    }, 'json');
  }
  if (GENERATE_LABELS) {
    console.log(createLabelString(labels));
  }

}

function oneOrSplit(s) {
  var splitted = s.split("\n");
  if (splitted.length == 1) { return splitted[0]; }
  return splitted;
}

function addNodeToConversation(conversation, labels, dialogs, node) {
  for (var i = 0; i < node.messages.length; ++i) {
    var cur = node.messages[i];
    if (cur.type == 'text' || cur.type == 'images' || cur.type == 'buttons' || cur.type === 'quickreplies' || cur.type === 'tbuttons') {
      var step = {type : cur.type };
      if (cur.type != 'quickreplies') {
        step.text = cur.text || "";
      }
      if (cur.type === 'quickreplies' || cur.type === 'buttons' ) {
        step.choices = [];
      }
      if (cur.type == 'images') {
        step.url = cur.attachments[0].image;
      }
      if (cur.type == 'tbuttons') {
        step.carousel = [];
        step.answer = [];
      }
      step.fromUser = !cur.side;
      step.id = cur._id;
      if (!step.fromUser) {
        var s = step.text;
        var idx=s ? s.indexOf("$.") : -1;
        if (idx >= 0) {
          var realText = s.substring(0, idx).trim();
          var variable = s.substring(idx+2);
          var shortText = "$."+variable;
          labels.push({"key" : shortText, "text" : realText});
          if (GENERATE_LABELS) {
            step.text = shortText;
          } else {
            step.text = realText;
          }
          step.dialog = variable.substring(0, variable.indexOf("."));
          dialogs.push(step.dialog);
        }
        conversation.push(step);
      } else {
        var prevConversation = conversation[conversation.length - 1];
        if (prevConversation) {
          //if last message was a text and user is answering --> prompt
          //if null then answer was a choice 
          if (prevConversation.type = "text") {
            prevConversation.type = "prompt";
          }
          prevConversation.answer = step;
        }
      }
    }  
    if (DEBUG) { console.log(cur.type, cur); }
    if (cur.type == 'quickreplies' || cur.type == 'buttons' || cur.type == 'tbuttons') {
      for (var t = 0; t < cur.attachments.length; ++t) {
        var attn = cur.attachments[t];
        var newStep = step;
        if (cur.type == 'tbuttons') {
          newStep = {
            text: attn.labels[0], type: step.type,
            subtitle: attn.labels[1],
            imageURL: attn.image,
            choices: []
          }
          step.carousel.push(newStep);
        }
        var answers = [];
        var choicesString = null;
        for (var j = 0; j < attn.choices.length; ++j) {
          var choice =  attn.choices[j];
          var choiceText = choice.text;

          var idx = choiceText.indexOf("$=");
          var choiceThenRef = j;
          if (idx >= 0) {
            choiceThenRef = parseInt(choiceText.substring(idx+2).trim());
            choiceText = choiceText.substring(0, idx).trim();
          }
          idx = choiceText.indexOf("$.");
          var choiceThenRefDialog = null;
          if (idx >= 0) {
            choiceThenRefDialog = choiceText.substring(idx+2).trim();
            choiceText = choiceText.substring(0, idx).trim();
          }
          newStep.choices.push(choiceText);
          labels.push({"key" : choiceText, "text" : choiceText});
          if (choicesString) {
            choicesString += "|"+choiceText;
          } else {
            choicesString = choiceText;
          }
          var answer  = {
            text : choiceText,
            thenDialog: choiceThenRefDialog,
            thenRef: choiceThenRef,
            then : []
          }
          var then = [];
          addNodeToConversation(then, labels, dialogs, ITEMS[choice.branch_id]);
          answer.then = then;
          answers.push(answer);
        }

        if (!conversation.length) {
          conversation.push({
          });
        }
        if (cur.type == "tbuttons") {
          newStep.choicesText = newStep.text+".Choices";
          labels.push({"key" : newStep.text+".Choices", "text" : choicesString});
          newStep.answer = answers;
          for (var k = 0; k < answers.length; ++k) {
            step.answer.push(answers[k]);
          }
        } else {
          conversation[conversation.length - 1].choicesText = newStep.text+".Choices";
          labels.push({"key" : newStep.text+".Choices", "text" : choicesString});
          conversation[conversation.length - 1].answer = answers;
        }
      }
    }
  }
}
}
