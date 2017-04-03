var MAIN_TREE = null;
var ITEMS = {};
var COUNTER = 0;

// control the execution
var DEBUG = false;
// true = generate language.json file content with all texts and replace with variable based
// in label: use $.<dialog>.<label-name>
var GENERATE_LABELS = false;

var botname = document.querySelectorAll('div[class^="botname"]')[0].innerText;
var fans = document.querySelectorAll('div[class^="fans"]')[0].innerText;
var category = document.querySelectorAll('div[class^="page_category"]')[0].innerText;
var image = document.querySelectorAll('div[class^="profile-picture"]')[0].attributes["data-picture"].nodeValue;
var conversationId = window.location.pathname.split('/').pop();
var previewURL = "https://botsociety.io/s/"+conversationId;

$.getJSON("https://botsociety.io/branches/getBranchesByConversationId?conversationId=" + conversationId
, function (data) { 
  if (DEBUG) { console.log(data); }
  MAIN_TREE = data;
  for (var i = 0; i < data.length; ++i) {

    $.getJSON("https://botsociety.io/branches/" + data[i]._id, function(item) {
      if (item) { ITEMS[item._id] = item; }
      COUNTER++;
      if (COUNTER == MAIN_TREE.length) {
        done();
      }
    });
  }
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
  for (var i = 0; i < MAIN_TREE.length; ++i) {
    var node = ITEMS[MAIN_TREE[i]._id];
    if (DEBUG) { console.log(node); }
    if (node._branches_in.length) {
      if (!ITEMS[node._branches_in[0]]) {
        console.log(node._branches_in[0]);
      }
      if (!ITEMS[node._branches_in[0]].childs) {
        ITEMS[node._branches_in[0]].childs = [];
      }
      ITEMS[node._branches_in[0]].childs.push(node);
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

  var bot = { "botname" : botname, "fans" : fans, "category" : category, "imageURL" : image, "previewURL": previewURL};
  console.log(JSON.stringify({"bot": bot, "conversation" : conversation}));
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
    if (node.messages[i].type == 'text' || node.messages[i].type == 'images' || node.messages[i].type == 'buttons' || node.messages[i].type === 'quickreplies') {
      var step = {type : node.messages[i].type };
      if (node.messages[i].type != 'quickreplies') {
        step.text = node.messages[i].text || "";
      }
      if (node.messages[i].type === 'quickreplies' || node.messages[i].type === 'buttons' ) {
        step.choices = [];
      }
      if (node.messages[i].type == 'images') {
        step.url = node.messages[i].attachments[0].image;
      }
      step.fromUser = !node.messages[i].side;
      if (!step.fromUser) {
        var s = step.text;
        var idx=s.indexOf("$.");
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
    if (DEBUG) { console.log(node.messages[i].type, node.messages[i]); }
    if (node.messages[i].type == 'quickreplies' || node.messages[i].type == 'buttons') {
      var answers = [];
      var choicesString = null;
      for (var j = 0; j < node.messages[i].attachments[0].choices.length; ++j) {
        var choice =  node.messages[i].attachments[0].choices[j];
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
        step.choices.push(choiceText);
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
      conversation[conversation.length - 1].choicesText = step.text+".Choices";
      labels.push({"key" : step.text+".Choices", "text" : choicesString});
      conversation[conversation.length - 1].answer = answers;
    }
  }
}