/** Shared visible officer equipment; rank 0 (including unknown enemies) has no insignia. */
export type RegaliaShape = 'box' | 'cylinder' | 'cone';
export type RegaliaColor = 'gold' | 'silver' | 'pale' | 'uniform' | 'dark';
export type RegaliaPart = (shape: RegaliaShape, color: RegaliaColor, x: number, y: number, z: number, sx: number, sy: number, sz: number, rz?: number) => void;
export function officerLook(rank: number) {
  const family = rank ? Math.ceil(rank / 3) : 0, tier = rank ? (rank - 1) % 3 + 1 : 0;
  return { family, tier, height: rank ? [.84,.9,.96,.98,1.04,1.1,1.12,1.2,1.3][rank-1] : 1,
    accent: (family === 3 ? 'gold' : family === 2 ? 'silver' : 'pale') as RegaliaColor };
}
export function addOfficerRegalia(rank: number, part: RegaliaPart) {
  if (!rank) return;
  const {family,tier,accent}=officerLook(rank);
  const shoulders=family===3?.44:family===2?.4:.29;
  part('box',accent,0,.56,0,shoulders,.07,.2);
  for(let i=0;i<tier;i++)part('box',accent,(i-(tier-1)/2)*.08,.47,.14,.05,.06,.04);
  if(family===3){
    // Long mantles and broad helmet silhouettes make generals distinct at a distance.
    part('cone',tier===3?'dark':'uniform',0,.35,-.12,.42,.42+tier*.1,.28);
    part('cylinder',accent,0,.74,0,.35,.13,.3);
    if(tier===3){
      part('box',accent,0,.85,0,.48,.08,.07);
      for(const x of [-.2,0,.2])part('cone',accent,x,1.01,0,.1,.31,.08,x*1.5);
    }else if(tier===2){for(const x of [-.16,.16])part('cone',accent,x,.93,0,.1,.29,.08,x*2);}
    else part('cone',accent,0,.88,0,.11,.22,.1);
    part('box',accent,.23,.43,.05,.04,.46,.05,-.18);
  }else if(family===2){
    part('cylinder','dark',0,.75,0,.32,.09,.26);
    for(const x of [-.19,.19])part('box',accent,x,.6,0,.12,.04*tier,.2);
    for(let i=0;i<tier;i++)part('box',accent,0,.34+i*.055,.15,.24,.025,.03);
    if(tier===3){part('cylinder','dark',-.25,.61,-.12,.025,.8,.025);part('box',accent,-.13,.94,-.12,.26,.2,.03);}
    else if(tier===2)part('cone',accent,0,.85,0,.16,.19,.12);
    else part('box',accent,0,.81,.1,.09,.05,.03);
  }else{
    part('cylinder','pale',0,.74,0,.29,.08,.25);
    for(let i=0;i<tier;i++)part('cone',accent,(i-(tier-1)/2)*.07,.83,0,.05,.12,.05);
    part('box','dark',.2,.35,.05,.07,.22+tier*.1,.08,tier===1?.65:-.15);
    if(tier===3)part('cone','silver',.24,.69,.05,.045,.22,.045);
  }
}
