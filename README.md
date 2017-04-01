# botsociety-to-JSON
A small tool to extract botsociety bots to JSON

# How to use

Copy paste the following code into chrome console when on a bot project page

```js

var MAIN_TREE = null;
var ITEMS = {};
var COUNTER = 0;
var DEBUG = false;

$.getJSON("https://botsociety.io/branches/getBranchesByConversationId?conversationId=" + window.location.pathname.split('/').pop()
, function (data) { 
  console.log(data);
  MAIN_TREE = data;
  for (var i = 0; i < data.length; ++i) {

    $.getJSON("https://botsociety.io/branches/" + data[i]._id, function(item) {
      ITEMS[item._id] = item;
      COUNTER++;
      if (COUNTER == MAIN_TREE.length) {
        done();
      }
    });
  }
});

function done() {

  var ROOT = null;
  for (var i = 0; i < MAIN_TREE.length; ++i) {
    var node = ITEMS[MAIN_TREE[i]._id];
    if (DEBUG) { console.log(node); }
    if (node._branches_in.length) {
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
  addNodeToConversation(conversation, ROOT);

  console.log(JSON.stringify(conversation));
}


function addNodeToConversation(conversation, node) {
  for (var i = 0; i < node.messages.length; ++i) {
    if (node.messages[i].type == 'text' || node.messages[i].type == 'images' || node.messages[i].type == 'buttons') {
      var step = {dialog: 'A', step: 1, type : node.messages[i].type };
      if (node.messages[i].type != 'quickreplies') {
        step.text = node.messages[i].text;
      }
      if (node.messages[i].type == 'images') {
        step.url = node.messages[i].attachments[0].image;
      }
      conversation.push(step);
    }  
    if (DEBUG) { console.log(node.messages[i].type, node.messages[i]); }
    if (node.messages[i].type == 'quickreplies' || node.messages[i].type == 'buttons') {
      var answers = [];
      for (var j = 0; j < node.messages[i].attachments[0].choices.length; ++j) {
        var choice =  node.messages[i].attachments[0].choices[j];
        var answer  = {
          text : choice.text,
          then : []
        }
        var then = [];
        addNodeToConversation(then, ITEMS[choice.branch_id]);
        answer.then = then;
        answers.push(answer);
      }

      if (!conversation.length) {
        conversation.push({
        });
      }
      conversation[conversation.length - 1].answer = answers;
      conversation[conversation.length - 1].answerType = node.messages[i].type;
    }
  }
}


```
