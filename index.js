'use strict';

const dotenv = require('dotenv').config();
// Imports dependencies and set up http server
const
  express = require('express'),
  bodyParser = require('body-parser'),
  app = express().use(bodyParser.json()); // creates express http server
const SSH = require('simple-ssh');
const request = require('request');

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

var get_username = {};
var get_host = {};
var get_ssh_instance = {};

// Sets server port and logs message on success
app.listen(process.env.PORT || 80, () => console.log('webhook is listening'));

// Creates the endpoint for our webhook 
app.post('/webhook', (req, res) => {  
 
  let body = req.body;

  // Checks this is an event from a page subscription
  if (body.object === 'page') {

    // Iterates over each entry - there may be multiple if batched
    body.entry.forEach(function(entry) {

      // Gets the message. entry.messaging is an array, but 
      // will only ever contain one message, so we get index 0
      let webhook_event = entry.messaging[0];

      // Get the sender PSID
      let sender_psid = webhook_event.sender.id;

      // Check if the event is a message and if so
      // pass the event to the message handler function
      if (webhook_event.message) {
        handleMessage(sender_psid, webhook_event.message);
      }

    });

    // Returns a '200 OK' response to all requests
    res.status(200).send('EVENT_RECEIVED');
  } else {
    // Returns a '404 Not Found' if event is not from a page subscription
    res.sendStatus(404);
  }

});

// Adds support for GET requests to our webhook
app.get('/webhook', (req, res) => {

  // Parse the query params
  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];

  // Checks if a token and mode is in the query string of the request
  if (mode && token) {

    // Checks the mode and token sent is correct
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      
      // Responds with the challenge token from the request
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    
    } else {
      // Responds with '403 Forbidden' if verify tokens do not match
      res.sendStatus(403);
    }
  }
});

// Handles messages events
function handleMessage(sender_psid, received_message) {
  let response;

  // Check if the message contains text
  if (received_message.text) {
    if (sender_psid in get_ssh_instance) {
      // Already logged in
    } else {
      if (sender_psid in get_username && sender_psid in get_host) {
        // Awaiting password
        get_ssh_instance[sender_psid] = new SSH({
          host: get_host[sender_psid],
          user: get_username[sender_psid],
          pass: received_message.text,
        });
        get_ssh_instance[sender_psid].exec('pwd', {
          out: function(stdout) {
            console.log(stdout);
          }
        }).start();
        get_ssh_instance[sender_psid].exec('ls -l', {
          out: function(stdout) {
            console.log(stdout);
          }
        }).start();
      } else {
        // New login - expect format `ssh username@domain`
        if (received_message.text.startsWith("ssh ")) {
          let user_string = received_message.text.slice(4);
          let user_details = user_string.split("@");
          if (user_details.length != 2) {
            response = {"text": "Try using the command 'ssh username@host'"};
          } else {
            get_username[sender_psid] = user_details[0]
            get_host[sender_psid] = user_details[1]
            response = {"text": `${user_string}'s password:`};
          }
        } else {
          response = {"text": "Try using the command 'ssh username@host'"};
        }
      }
    }
  }

  // Sends the response message
  callSendAPI(sender_psid, response);    
}

// Sends response messages via the Send API
function callSendAPI(sender_psid, response) {
  // Construct the message body
  let request_body = {
    "recipient": {
      "id": sender_psid
    },
    "message": response
  }

  // Send the HTTP request to the Messenger Platform
  request({
    "uri": "https://graph.facebook.com/v2.6/me/messages",
    "qs": { "access_token": PAGE_ACCESS_TOKEN },
    "method": "POST",
    "json": request_body
  }, (err, res, body) => {
    if (err) {
      console.error("Unable to send message:" + err);
    }
  });
}