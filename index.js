const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const crypto = require('crypto');
// -----------------------------------------------------------------------------
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, 'client')));
// -----------------------------------------------------------------------------
const {Server} = require('./js/server');

function main() {
    const clients = {};
    const exchangeData = {};
    const getClientProfiles = () => {
	const clientProfiles = {};
	Object.keys(clients).forEach(id => { clientProfiles[id] = clients[id].profile});
	return clientProfiles;
    };

    const hasher = id => crypto.createHash('sha1').update(id).digest('hex');    
    const gameServer = new Server({ io, clients, hasher })
	  .subscribe({
	      update: (caller, dict, callback) => {
		  Object.keys(dict).forEach(key =>
		      caller.profile[key] = dict[key]
		  );
		  callback(caller.profile);
	      },
	      profile: (caller, id, callback) => {
		  const requestedProfile = clients[id].profile;
		  callback(requestedProfile);
	      },
	      profiles: (caller, callback) => {
		  callback(getClientProfiles());
	      },
	      relay: async (caller, receiverId, messageName, ...args) => {
		  const callback = args.pop();
		  
		  if (!clients[receiverId]) {
		      callback({error: 'Receiver not found'});
		      return;
		  }
		  
		  const receiver = clients[receiverId];
		  const response = await receiver.message(messageName, caller.id, ...args);

		  console.log(receiverId, 'respond', caller.id, response);
		  callback(response);
	      },
	      exchange: (caller, targetId, data, callback) => {
		  const key = [caller.id, targetId].sort().join(' ');
		  exchangeData[key] = {...exchangeData[key], [caller.id]: {data, callback}};

		  if (key === Object.keys(exchangeData[key]).sort().join(' ')) {
		      const sharedData = {
			  [caller.id]: exchangeData[key][caller.id].data,
			  [targetId]: exchangeData[key][targetId].data,
		      };
		      exchangeData[key][caller.id].callback(sharedData[targetId]);
		      exchangeData[key][targetId].callback(sharedData[caller.id]);

		      delete exchangeData[key];
		  }
	      },
	      connect: (caller) => {
		  io.emit('profiles', getClientProfiles());
	      },
	      disconnect: (caller) => {
		  delete clients[caller.id];
		  Object.keys(exchangeData) // Cancel all unresolved exchanges: avoid messing up reconnect
		      .filter(key => key.includes(caller.id))
		      .forEach(key => delete exchangeData[key][caller.id]);

		  io.emit('profiles', getClientProfiles());
	      },
	      echo: (caller, ...args) => {
		  const callback = args.pop();
		  callback(args);
	      },
	  });
}

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    main();
});
// -----------------------------------------------------------------------------
