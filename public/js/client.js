let jobs = {};
let refreshIntervalId;

async function updateJobs() {
    console.log('updateJobs')
}

function groupByKey(array, key) {
  return array
    .reduce((hash, obj) => {
      if(obj[key] === undefined) return hash; 
      return Object.assign(hash, { [obj[key]]:( hash[obj[key]] || [] ).concat(obj)})
    }, {})
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
    const groupedJobs = groupByKey(jobs, 'channelId');
    Object.entries(groupedJobs).forEach(([key, value]) => {
      console.log('groupedJobs--->', key);
      console.log('groupedJobs--->', value)

      let jobsHtml = "";
      value.forEach(job => {
        jobsHtml += renderJob(job);
      });

      s +=`
      <div style="margin-top: 10px">
        <div  class='tl mt2 mb1'><u><b>Channel ID:</span></b>  ${key}</u></div>
        <div class="hk-well" style="margin-top: 10px">  
          ${jobsHtml}
        </div>
      </div>
      `;
    });

    document.querySelector("#job-summary").innerHTML = s;
  }

// Renders the HTML for each job object
function renderJob(job) {
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
        <div class='mt2 mb1'><span class="hk-label">File:</span> ${item.name}</div>
        <div class='mt2 mb1'><span class="hk-label">Type:</span> ${item.type}</div>
        <div class='mt2 mb1'><span class="hk-label">Status:</span> <b>${item.status}</b></div>
      </div>
      <div  class='tl mt2 mb1'><span class="hk-label">Respone Message:</span> ${item.response}</div>
      <hr />
      `
      items = items+html;

    })


   const jobHtml = `
   <div>
    <div class='tl mt2 mb1' style="margin-left: 10px" ><span class="hk-label"><b><u>Content Name:</span> ${job.queueName}</b></u></div>
    <div class="bg-lightest-silver bw1 flex flex-column ma2 hk-well">

      <div class="w-100 br1 shadow-inner-1">
        <span class="db h1 br1 ${color}" style="width: ${progress}%;"></span>
      </div>

      <div class="flex justify-between mb2">
        <div class='mt2 mb1'><span class="hk-label"><b>Job ID:</span> ${job.jobId}</b></div>
        <div class='mt2 mb1'><span class="hk-label"><b>Total Contents:</span> ${job.items.length}</b></div>
        <div class='mt2 mb1'><span class="hk-label"><b>Uploaded Contents:</span> ${job.counter}</b></div>
        <div class='mt2 mb1'><span class="hk-label"><b>State:</span> ${job.state}</b></div>
      </div>
      <div>
        ${items}
      </div>
      </div>
      </div>`; 
    
    return jobHtml;
  }

  
  // Attach click handlers and kick off background processes
  window.onload = function() {

    document.querySelector("#refresh").addEventListener("click", getJobs);
    getJobs();
    //refreshIntervalId = setInterval(getJobs, 5000);
  };