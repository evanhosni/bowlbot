const socket = io("https://bowlbot-server.herokuapp.com/")
var bowls = document.querySelector("#bowls")

socket.on("bowlcount", (message) => {
    console.log("init" + message)
    bowls.innerHTML = message
})