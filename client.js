// const socket = io("http://localhost:3000/")
const socket = io("https://bowlbot-server.herokuapp.com")
var bowls = document.querySelector(".counter")
var modal = document.querySelector('#modal')
var listArray = document.querySelector('#leaderboards').querySelectorAll('table')

socket.on("bowlcount", (data) => {//TODO separate bowlcount for connection
    socket.emit("leaderboards")
    setTimeout(() => {
        bowls.innerHTML = data
    },3500)
})

socket.on("leaderboards", (data) => {
    console.log('hello from server')
    var total = data[0] || []
    var year = data[1] || []
    var month = data[2] || []
    var week = data[3] || []
    var day = data[4] || []
    var hour = data[5] || []
    var dataArray = [total,year,month,week,day,hour]
    console.log(total,year,month,week,day,hour)

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
        for (let test = 0; test < 5; test++) {//TODO yeet

            

        for (let j = 0; j < dataArray[i].length; j++) {
            var row = document.createElement('tr')
            var rank = document.createElement('td')
            var name = document.createElement('td')
            var bowls = document.createElement('td')
            function suffix(num) {
                var k = num % 10
                var l = num % 100
                if (k == 1 && l != 11) {
                    return "st";
                }
                if (k == 2 && l != 12) {
                    return "nd";
                }
                if (k == 3 && l != 13) {
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
                }// TODO yeet
    }

    let servernames = document.querySelectorAll('.name')
    for (let i = 0; i < servernames.length; i++) {
        console.log(servernames[i].scrollWidth)
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

function leaderboards(range) {
    socket.emit('leaderboards')//TODO: not really necessary
    modal.style.display = 'flex'
    for (let i = 0; i < listArray.length; i++) {
        listArray[i].style.display = 'none'
    }
    var tabArray = document.getElementById('tabs').children
    for (let i = 0; i < tabArray.length; i++) {
        tabArray[i].style.textDecoration = 'none'
    }
    document.getElementById(`list-${range}`).style.display = 'table'
    document.getElementById(`tab-${range}`).style.textDecoration = 'underline'
    document.querySelector('body').style.overflowY = 'hidden'
}

function feedback() {
    
}

modal.addEventListener('click',(e)=>{
    if (e.target.id === "modal") {
        modal.style.display = 'none'
        document.querySelector('body').style.overflowY = 'visible'
    }
})