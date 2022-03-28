const socket = io("https://bowlbot-server.herokuapp.com/")
var bowls = document.querySelector("#bowls")

socket.on("init", (message) => {
    console.log("init" + message)
    bowls.innerHTML = message
})

socket.on("bowlcount", (message) => {
    console.log("init" + message)
    bowls.innerHTML = message
})