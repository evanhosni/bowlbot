const socket = io("https://bowlbot-server.herokuapp.com:49466/socket.io/?EIO=4&transport=websocket")
var bowls = document.querySelector("#bowls")

socket.on("bowlcount", (message) => {
    console.log(message)
    bowls.innerHTML = message
})

