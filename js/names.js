const ADJECTIVES = [
  'Mighty','Sneaky','Golden','Iron','Shadow','Lucky','Crazy','Epic',
  'Swift','Clever','Bold','Fierce','Cunning','Reckless','Legendary',
  'Ancient','Cosmic','Blazing','Frosty','Electric',
];

const BASE_NAMES = [
  'DiceMaster3000','BonkBot','CheckerWrecker','BarBrawler','DoubleTrouble',
  'GammonGoblin','BoardBoss','PointProwler','BlotBuster','TurnTurtle',
  'RollRaider','PipPirate','BackgammonBaron','DoubleDown','SnakeEyes',
  'QuadKing','TriMaster','PipCounter','BearOffBoss','HomeRunner',
  'BlockBuilder','RunnerRunner','AnchorDropper','PrimeTime','SlotMachine',
  'DiceDevil','BackgammonBoss','BoardBreaker','CheckerChaser','CubeKing',
  'GammonGuru','PipPusher','PointMaker','BarHopper','HomeBoardHero',
  'TurkeyLeg','DiceDragon','BoardBandit','GammonGhost','RollMaster',
  'CheckerChamp','PointPincher','BlotBomber','TripleDouble','QuadRuler',
  'DiceWizard','BackgammonBully','BoardKnight','GammonGladiator','PipKing',
  'RollRoyale','SlotSmasher','AnchorKing','PrimeProwler','DoubleAgent',
];

export function generateFunnyName() {
  const useAdj = Math.random() > 0.45;
  const name   = BASE_NAMES[Math.floor(Math.random() * BASE_NAMES.length)];
  if (useAdj) {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    return `${adj}${name}`;
  }
  return name;
}
