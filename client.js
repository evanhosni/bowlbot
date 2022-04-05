const socket = io(process.env.SERVER_URL)
// const socket = io("http://localhost:3000/")
var bowls = document.querySelector(".counter")

socket.on("bowlcount", (message) => {//TODO separate bowlcount for connection
    setTimeout(() => {
        bowls.innerHTML = message
    },3500)
})
// number = 995
// bowls.innerHTML = number
// setInterval(() => {
//     number++
//     bowls.innerHTML = number
// },1000)

