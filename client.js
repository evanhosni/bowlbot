const socket = io("https://bowlbot-server.herokuapp.com/", {
    cors: {
        origin: `http://fart-game.herokuapp.com`, // I copied the origin in the error message and pasted here
        methods: ["GET", "POST"],
        credentials: true
      }
})
var bowls = document.querySelector("#bowls")

socket.on("bowlcount", (message) => {
    console.log(message)
    bowls.innerHTML = message
})

