(function() {
    var key = 'passages_visited';
    var visited = JSON.parse(localStorage.getItem(key) || '[]');
    var current = window.location.pathname;

    if (visited.indexOf(current) === -1) {
        visited.push(current);
        localStorage.setItem(key, JSON.stringify(visited));
    }

    var el = document.getElementById('paradox');
    if (el) {
        var count = visited.length;
        el.textContent = 'You have visited ' + count + (count === 1 ? ' passage' : ' passages');
        el.style.opacity = '0';
        setTimeout(function() {
            el.style.transition = 'opacity 0.8s';
            el.style.opacity = '0.6';
        }, 600);
    }
})();
