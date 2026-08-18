/**
 * Cricket scoring helper functions
 */

function isLegalDelivery(extraType) {
  // Wides and No Balls are not legal deliveries (they don't count towards the over)
  return extraType !== 'WIDE' && extraType !== 'NO_BALL';
}

function calculateOvers(totalLegalBalls) {
  const completeOvers = Math.floor(totalLegalBalls / 6);
  const remainingBalls = totalLegalBalls % 6;
  return parseFloat(`${completeOvers}.${remainingBalls}`);
}

function calculateTotalRuns(runsOffBat, extraType, extraRuns) {
  let total = runsOffBat;
  if (extraType) {
    total += extraRuns;
    // Wides and No Balls carry a 1-run penalty by default, plus any additional runs
    if (extraType === 'WIDE' || extraType === 'NO_BALL') {
      total += 1;
    }
  }
  return total;
}

function shouldSwapStriker(runsOffBat, extraType, extraRuns, isEndOfOver) {
  // Determine how many runs were physically run by the batters
  let physicalRuns = runsOffBat;
  if (extraType === 'BYE' || extraType === 'LEG_BYE' || extraType === 'WIDE' || extraType === 'NO_BALL') {
    physicalRuns += extraRuns; // they run for extras
  }
  
  let swap = physicalRuns % 2 !== 0;

  if (isEndOfOver) {
    swap = !swap; // Swap again at the end of the over
  }
  
  return swap;
}

module.exports = {
  isLegalDelivery,
  calculateOvers,
  calculateTotalRuns,
  shouldSwapStriker
};
