// const socket = io("http://localhost:3000/")
const socket = io()
// TODO: ^seems to work, but for some reason i am getting a connection error in the console
var connectedToServer
var currentBowls
var bowls = document.querySelector(".counter")
var modal = document.querySelector('#modal')
var listArray = document.querySelector('#leaderboards').querySelectorAll('table')
var form = document.querySelector('#feedback-content')

document.querySelector("#agree-button").addEventListener("click",() => {
    console.log("ye")
    document.querySelector("#disclaimer-container").style.display = "none"
    document.querySelector("main").style.display = "flex"
    setTimeout(() => {
        bowls.innerHTML = currentBowls
    },2500)
})

socket.on("bowlcount", (data) => {
    setTimeout(() => {
        bowls.innerHTML = data
    },3500)
})

var error = document.querySelector('#error')


var closeButtons = document.querySelectorAll('.close')
for (let i = 0; i < closeButtons.length; i++) {
    closeButtons[i].addEventListener('click',closeModal)
}

function closeModal() {
    modal.style.display = 'none'
    document.querySelector('body').style.overflowY = 'visible'
    document.querySelector('main').style.visibility = 'visible'
}