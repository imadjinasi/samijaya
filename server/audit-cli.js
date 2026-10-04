'use strict';
const { context } = require('./compat');
const { close } = require('./sync-bridge');
const report = context().auditPhase8DReadinessReadOnly();
console.log('readiness:', report.status, 'ok:', report.ok);
for (const [name,section] of Object.entries(report.sections)) {
  const findings=section.findings||[];
  console.log(name, 'section:', section.status, 'findings:', findings.length);
  for (const finding of findings) {
    if (finding && finding.code) console.log(' ',finding.code, 'count:', Number(finding.count||0),
      'severity:',finding.severity||'', 'status:',finding.status||'');
  }
}
close().then(() => { process.exitCode=report.ok?0:2; });
