// client/summary.js

document.addEventListener('DOMContentLoaded', () => {
    const killSummaryTableBody = document.querySelector('#killSummaryTable tbody');
    const backToMenuBtn = document.getElementById('backToMenuBtn');

    const killSummary = JSON.parse(localStorage.getItem('killSummary') || '[]');

    if (killSummary.length > 0) {
        killSummary.sort((a, b) => b.kills - a.kills);
        killSummary.forEach(player => {
            const tableRow = document.createElement('tr');
            tableRow.innerHTML = `<td>${player.name}</td><td>${player.kills}</td>`;
            killSummaryTableBody.appendChild(tableRow);
        });
    } else {
        const tableRow = document.createElement('tr');
        tableRow.innerHTML = '<td colspan="2">No kill data available.</td>';
        killSummaryTableBody.appendChild(tableRow);
    }

    backToMenuBtn.addEventListener('click', () => {
        localStorage.removeItem('killSummary');
        window.location.href = 'index.html';
    });
});
