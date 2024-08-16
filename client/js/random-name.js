export function randomName() {
    const nouns = ["Brick", "Mortar", "Trowel", "Scaffold", "Blueprint", "Cement", "Plumb", "Level", "Hammer", "Nail", "Sledge", "Chisel", "Goggles", "Helmet", "Gloves", "Boots", "Wheelbarrow", "Mixer", "Bucket", "Tape", "Measure", "Ladder", "Drill", "Screw", "Bolt", "Wrench", "Saw", "Blade", "Dust", "Mask", "Grit", "Grout", "Tile", "Panel", "Stud", "Beam", "Joist", "Rafter", "Plank", "Board", "Sheet", "Plywood", "Concrete", "Rebar", "Shovel", "Pickaxe", "Jackhammer", "Crane", "Hoist", "Pulley"];
    const adjectives = ["Sturdy", "Solid", "Heavy", "Massive", "Bulky", "Rugged", "Tough", "Hardy", "Firm", "Robust", "Strong", "Mighty", "Brawny", "Stalwart", "Resilient", "Durable", "Unyielding", "Immovable", "Rigid", "Stiff", "Unbreakable", "Indestructible", "Inflexible", "Unbending", "Steadfast", "Resolute", "Unwavering", "Unshakeable", "Unflinching", "Uncompromising", "Inexorable", "Intransigent", "Adamant", "Tenacious", "Persistent", "Determined", "Resolute", "Unrelenting", "Unstoppable", "Unassailable", "Invincible", "Impregnable", "Formidable", "Dauntless", "Fearless", "Intrepid", "Valiant", "Gallant", "Heroic", "Brave"];

    const adjectiveIdx = Math.floor(Math.random() * adjectives.length);
    const nounIdx = Math.floor(Math.random() * nouns.length);

    const adjective = adjectives[adjectiveIdx];
    const noun = nouns[nounIdx];

    return `${adjective} ${noun}`;
}
