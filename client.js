const socket = io("https://bowlbot-server.herokuapp.com")
// const socket = io("http://localhost:3000/")
var bowls = document.querySelector("#bowls")

socket.on("bowlcount", (message) => {
    console.log(message)
    bowls.innerHTML = message
})