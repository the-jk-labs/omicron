// SPDX-License-Identifier: AGPL-3.0-or-later
export const complexTableHtml =
  '<table lang="en" aria-labelledby="sales-caption" aria-describedby="sales-notes">' +
  '<caption id="sales-caption" lang="fr" dir="ltr">Sales by region</caption><tbody>' +
  '<tr><th id="region" scope="col" rowspan="2"><p>Region</p></th>' +
  '<th id="totals" scope="colgroup" colspan="2"><p>Totals</p></th></tr>' +
  '<tr lang="en"><th id="year" scope="col" headers="totals"><p>Year</p></th>' +
  '<th id="count" scope="col" headers="totals"><p>Count</p></th></tr>' +
  '<tr><th id="north" scope="row" headers="region"><p>North</p></th>' +
  '<td headers="north year"><p>2026</p></td><td headers="north count"><p>20</p></td></tr>' +
  '</tbody></table><p id="sales-notes" lang="en">Values exclude returns.</p>';

export const targetTableHtml =
  '<table aria-labelledby="target-caption"><caption id="target-caption" lang="en">Destination table</caption>' +
  '<tbody><tr><th id="target-left" scope="col"><p>Left</p></th>' +
  '<th id="target-right" scope="col"><p>Right</p></th></tr>' +
  '<tr><td headers="target-left"><p>alpha</p></td><td headers="target-right"><p>beta</p></td></tr></tbody></table><p></p>';
