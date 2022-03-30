const socket = io("https://bowlbot-server.herokuapp.com/")
var bowls = document.querySelector("#bowls")

setInterval(()=> {
console.log(number)
},1000)

socket.on("bowlcount", (message) => {
    console.log(message)
    bowls.innerHTML = message
})

// setInterval(()=> {
//     window.location.reload();
// },1000)