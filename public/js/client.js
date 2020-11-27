let jobs = {};
let refreshIntervalId;

async function updateJobs() {
    console.log('updateJobs')
}


// Kick off a new job by POST-ing to the server
async function getJobs() {
    let res = await fetch('/jobs', {method: 'GET'});
    const response = await res.json();

    jobs = response.jobs;
    if(jobs  && jobs.length){
        const filteredJobs = jobs ? jobs.filter(ele => ele.state !== 'completed') : [];
        if(filteredJobs.length === 0){
            clearInterval(refreshIntervalId);
        }
    }

    let s = "";
    jobs.forEach(job => {
        s += renderJob(job);
    });
    document.querySelector("#job-summary").innerHTML = s;
  }

// Renders the HTML for each job object
function renderJob(job) {
    console.log('job', job.items);
    let progress = job.progress || 0;
    let color = "bg-light-purple";
  
    if (job.state === "completed") {
      color = "bg-purple";
      progress = 100;
    } else if (job.state === "failed") {
      color = "bg-dark-red";
      progress = 100;
    }

    let items= '';

    job.items.forEach(item => {
        const html = `<div class="flex justify-between mb2">
        <div class='mt2 mb1'><span class="hk-label">Title:</span> ${item.title}</div>
        <div class='mt2 mb1'><span class="hk-label">Type:</span> ${item.type}</div>
        <div class='mt2 mb1'><span class="hk-label">Status:</span> ${item.type}</div>
      </div>`
      items = items+html;

    })
    
    return document.querySelector('#job-template')
      .innerHTML
      .replace('{{id}}', job.jobId)
      .replace('{{state}}', job.state)
      .replace('{{color}}', color)
      .replace('{{progress}}', progress)
      .replace('{{items}}', items);
  }
  
  // Attach click handlers and kick off background processes
  window.onload = function() {
    getJobs();
    refreshIntervalId = setInterval(getJobs, 200);
  };