// const socket = io("http://localhost:3000/")
const socket = io("https://bowlbot.app/")
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

socket.on("init", (data) => {
    connectedToServer = true
    socket.emit("leaderboards")
    currentBowls = data
})

socket.on("bowlcount", (data) => {
    socket.emit("leaderboards")
    setTimeout(() => {
        bowls.innerHTML = data
    },3500)
})

socket.on("leaderboards", (data) => {
    console.log('hello from server')
    var total = data[0]
    var year = data[1]
    var month = data[2]
    var week = data[3]
    var day = data[4]
    var hour = data[5]
    var dataArray = [total,year,month,week,day,hour]

    for (let i = 0; i < listArray.length; i++) {
        listArray[i].innerHTML = ''
        var thRow = document.createElement('tr')
        var thRank = document.createElement('th')
        var thName = document.createElement('th')
        var thBowls = document.createElement('th')
        thRank.textContent = 'Rank'
        thRank.className = 'rank'
        thName.textContent = 'Server Name'
        thName.className = 'name'
        thBowls.textContent = 'Bowls'
        thBowls.className = 'bowls'
        thRow.append(thRank,thName,thBowls)
        listArray[i].append(thRow)
        // for (let test = 0; test < 5; test++) {//TODO yeet (this is for testing leaderboard scrolling)

            

        for (let j = 0; j < dataArray[i].length; j++) {
            var row = document.createElement('tr')
            var rank = document.createElement('td')
            var name = document.createElement('td')
            var bowls = document.createElement('td')
            function suffix(num) {
                if (num % 10 == 1 && num % 100 != 11) {
                    return "st";
                }
                if (num % 10 == 2 && num % 100 != 12) {
                    return "nd";
                }
                if (num % 10 == 3 && num % 100 != 13) {
                    return "rd";
                }
                return "th";
            }
            rank.textContent = j + 1 + suffix(j + 1)
            rank.className = 'rank'
            name.textContent = dataArray[i][j].name
            name.className = 'name'
            bowls.textContent = dataArray[i][j].bowls
            bowls.className = 'bowls'
            row.append(rank,name,bowls)
            listArray[i].append(row)
        }
                // }// TODO yeet (this is for testing leaderboard scrolling)
    }

    let servernames = document.querySelectorAll('.name')
    for (let i = 0; i < servernames.length; i++) {
        timeout()
        function timeout(){
            servernames[i].scrollLeft = 0
            setTimeout(()=>{
                shift()
            },3000)
        }
        function shift() {
            const shiftX = setInterval(()=>{
                servernames[i].scrollLeft ++
                if (servernames[i].scrollLeft + servernames[i].offsetWidth == servernames[i].scrollWidth) {
                    clearInterval(shiftX)
                    setTimeout(()=>{
                        timeout()
                    },1000)
                }
            },75)
        }
    }
})

var leaderboardsOpen = false
var feedbackOpen = false
var error = document.querySelector('#error')

function leaderboards(range) {
    feedbackOpen = false
    leaderboardsOpen = true;
    modal.style.display = 'flex'
    document.querySelector('#feedback').style.display = 'none'
    document.querySelector('#leaderboards').style.display = 'flex'
    document.querySelector('body').style.overflowY = 'hidden'
    document.querySelector('main').style.visibility = 'hidden'
    for (let i = 0; i < listArray.length; i++) {
        listArray[i].style.display = 'none'
    }
    var tabArray = document.querySelector('#tabs').children
    for (let i = 0; i < tabArray.length; i++) {
        tabArray[i].style.textDecoration = 'none'
    }
    document.querySelector(`#tab-${range}`).style.textDecoration = 'underline'

    if (!connectedToServer) {
        document.querySelector('#tabs').style.display = 'none'
        document.querySelector('#tables').style.display = 'none'
        document.querySelector('#hint').style.display = 'none'
        error.style.display = 'block'
    } else {
        document.querySelector('#tabs').style.display = 'flex'
        document.querySelector('#tables').style.display = 'block'
        document.querySelector('#hint').style.display = 'block'
        document.querySelector(`#table-${range}`).style.display = 'table'
        error.style.display = 'none'
    }
}

function feedback() {
    leaderboardsOpen = false
    feedbackOpen = true;
    modal.style.display = 'flex'
    document.querySelector('#leaderboards').style.display = 'none'
    document.querySelector('#feedback').style.display = 'flex'
    document.querySelector('body').style.overflowY = 'hidden'
    document.querySelector('main').style.visibility = 'hidden'
}

document.querySelector('#btn-leaderboards').addEventListener('click',()=>{
    if (!leaderboardsOpen) {
        leaderboards('week')
    } else {
        closeModal()
    }
})

document.querySelector('#btn-feedback').addEventListener('click',()=>{
    if (!feedbackOpen) {
        feedback()
    } else {
        closeModal()
    }
})

var closeButtons = document.querySelectorAll('.close')
for (let i = 0; i < closeButtons.length; i++) {
    closeButtons[i].addEventListener('click',closeModal)
}

function closeModal() {
    modal.style.display = 'none'
    document.querySelector('body').style.overflowY = 'visible'
    document.querySelector('main').style.visibility = 'visible'
    leaderboardsOpen = false
    feedbackOpen = false
}

// modal.addEventListener('click',(e)=>{ //TODO: do u want click off modal to close it?
//     if (e.target.id === "modal") {
//         modal.style.display = 'none'
//         document.querySelector('body').style.overflowY = 'visible'
//     }
// })