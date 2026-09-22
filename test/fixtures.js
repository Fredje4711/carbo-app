export const meal = {
  meal_detected: true,
  items: [
    { name: 'Gekookte pasta', portion: '200 g gekookt', carbs_min_g: 48, carbs_best_g: 56, carbs_max_g: 64, confidence: 'middel', reasoning: 'De portie is opgegeven; het recept kan verschillen.' },
    { name: 'Groentesaus', portion: '100 g', carbs_min_g: 5, carbs_best_g: 8, carbs_max_g: 12, confidence: 'laag', reasoning: 'De hoeveelheid suiker in de saus is onbekend.' },
  ],
  total: { carbs_min_g: 53, carbs_best_g: 64, carbs_max_g: 76, confidence: 'middel' },
  summary: 'Een schatting voor pasta met groentesaus. Controleer de porties.',
  assumptions: ['De pasta is gewogen na het koken.'],
};
export const noMeal = { meal_detected: false, items: [], total: { carbs_min_g: 0, carbs_best_g: 0, carbs_max_g: 0, confidence: 'laag' }, summary: 'Geen duidelijke maaltijd zichtbaar.', assumptions: [] };
