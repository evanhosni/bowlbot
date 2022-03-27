const socket = io("https://bowlbot-server.herokuapp.com:80/")
var bowls = document.querySelector("#bowls")

socket.on("bowlcount", (message) => {
    console.log(message)
    bowls.innerHTML = message
})