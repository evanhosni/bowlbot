const socket = io("https://bowlbot-server.herokuapp.com")
// const socket = io("http://localhost:3000/")
// require('heroku-self-ping').default("https://evanhosni.github.io/bowlbot/");//TODO yeet
var bowls = document.querySelector("#bowls")

socket.on("bowlcount", (message) => {
    console.log(message)
    bowls.innerHTML = message
})

// setInterval(()=> {
//     window.location.reload();
// },1000)