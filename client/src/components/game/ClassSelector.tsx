import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCombat } from '@/lib/stores/useCombat';
import { CLASS_DEFINITIONS } from '@/lib/combat/actions';
import type { PlayerClass } from '@/lib/combat/types';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

export function ClassSelector() {
  const { playerClass, setPlayerClass, classLocked } = useCombat();
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  // Only show the new class system: none (Wanderer), melee (Warrior), ranged (Archer)
  const classes: PlayerClass[] = ['none', 'melee', 'ranged'];
  const selectedClass = classes[selectedIndex];
  const classInfo = CLASS_DEFINITIONS[selectedClass];

  const handleSelectClass = () => {
    if (!classLocked) {
      setPlayerClass(selectedClass);
    }
  };

  const goToPrevious = () => {
    setSelectedIndex((prev) => (prev - 1 + classes.length) % classes.length);
  };

  const goToNext = () => {
    setSelectedIndex((prev) => (prev + 1) % classes.length);
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Instructions */}
      <div className="text-center space-y-1 sm:space-y-2">
        <h2 className="text-xl sm:text-4xl font-bold bg-gradient-to-r from-amber-400 via-amber-200 to-amber-400 bg-clip-text text-transparent" style={{ fontFamily: 'Georgia, serif' }}>
          Choose Your Hero
        </h2>
        <p className="text-gray-300 text-xs sm:text-lg">
          Select a class to begin your adventure
        </p>
      </div>

      {/* Class Carousel */}
      <div className="relative">
        <Card className="bg-gradient-to-b from-stone-900/95 to-stone-800/95 border-2 sm:border-4 border-amber-700/50 shadow-2xl shadow-black/50 text-white">
          <CardContent className="p-3 sm:p-8">
            <div className="flex items-center gap-2 sm:gap-6">
              {/* Navigation Button - Left */}
              <Button
                onClick={goToPrevious}
                disabled={classLocked}
                className="h-12 w-8 sm:h-24 sm:w-16 bg-gradient-to-b from-stone-600 to-stone-700 hover:from-stone-500 hover:to-stone-600 border border-stone-500 shadow-xl disabled:opacity-30 p-1 sm:p-2"
                size="sm"
              >
                <ChevronLeft className="w-4 h-4 sm:w-8 sm:h-8" />
              </Button>

              {/* Class Display */}
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-8 items-center">
                {/* Left Side - Icon and Name */}
                <div className="text-center space-y-2 sm:space-y-4">
                  <div className="w-20 h-20 sm:w-32 sm:h-32 mx-auto bg-gradient-to-b from-stone-700 to-stone-800 border-2 border-amber-700 rounded-lg flex items-center justify-center shadow-lg">
                    <span className="text-3xl sm:text-5xl font-bold text-amber-300" style={{ fontFamily: 'Georgia, serif' }}>
                      {classInfo.name.charAt(0)}
                    </span>
                  </div>
                  <div className="space-y-1 sm:space-y-2">
                    <h3 className="text-xl sm:text-4xl font-bold bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent drop-shadow-md" style={{ fontFamily: 'Georgia, serif' }}>
                      {classInfo.name}
                    </h3>
                    <p className="text-xs sm:text-lg text-gray-300 leading-relaxed px-2 sm:px-4 line-clamp-2 sm:line-clamp-none">
                      {classInfo.description}
                    </p>
                  </div>
                </div>

                {/* Right Side - Stats and Ability */}
                <div className="space-y-2 sm:space-y-6">
                  {/* Stats */}
                  <div className="bg-black/40 p-3 sm:p-6 rounded-xl border border-amber-700/30 sm:border-2 space-y-1 sm:space-y-3">
                    <h4 className="text-sm sm:text-xl font-bold text-amber-300 mb-2 sm:mb-4">Base Stats</h4>
                    <div className="space-y-1 sm:space-y-3">
                      <div className="flex items-center justify-between text-xs sm:text-lg">
                        <span className="text-red-400 font-semibold">Health</span>
                        <span className="text-white font-bold text-sm sm:text-2xl">{classInfo.baseHp}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs sm:text-lg">
                        <span className="text-amber-400 font-semibold">Attack</span>
                        <span className="text-white font-bold text-sm sm:text-2xl">{classInfo.baseAttack}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs sm:text-lg">
                        <span className="text-stone-400 font-semibold">Defense</span>
                        <span className="text-white font-bold text-sm sm:text-2xl">{classInfo.baseDefense}</span>
                      </div>
                    </div>
                  </div>

                  {/* Special Ability */}
                  <div className="bg-gradient-to-br from-amber-900/60 to-stone-900/60 p-3 sm:p-6 rounded-xl border border-amber-600/50 sm:border-2">
                    <h4 className="text-xs sm:text-lg font-bold text-amber-200 mb-1 sm:mb-2">Special Ability</h4>
                    <div className="text-sm sm:text-xl font-bold text-amber-300 mb-1 sm:mb-2">{classInfo.specialAbility.name}</div>
                    <p className="text-xs sm:text-base text-stone-200 leading-relaxed line-clamp-2 sm:line-clamp-none">{classInfo.specialAbility.description}</p>
                  </div>
                </div>
              </div>

              {/* Navigation Button - Right */}
              <Button
                onClick={goToNext}
                disabled={classLocked}
                className="h-12 w-8 sm:h-24 sm:w-16 bg-gradient-to-b from-stone-600 to-stone-700 hover:from-stone-500 hover:to-stone-600 border border-stone-500 shadow-xl disabled:opacity-30 p-1 sm:p-2"
                size="sm"
              >
                <ChevronRight className="w-4 h-4 sm:w-8 sm:h-8" />
              </Button>
            </div>

            {/* Selection Indicator */}
            <div className="flex justify-center gap-1 sm:gap-2 mt-3 sm:mt-6">
              {classes.map((_, index) => (
                <button
                  key={index}
                  onClick={() => !classLocked && setSelectedIndex(index)}
                  disabled={classLocked}
                  className={`h-2 sm:h-3 rounded-full transition-all duration-300 ${
                    index === selectedIndex 
                      ? 'w-8 sm:w-12 bg-gradient-to-r from-amber-500 to-amber-300' 
                      : 'w-2 sm:w-3 bg-stone-600 hover:bg-stone-500'
                  }`}
                />
              ))}
            </div>

            {/* Confirm Button */}
            <div className="mt-3 sm:mt-6 text-center">
              <Button
                onClick={handleSelectClass}
                disabled={classLocked}
                className={`text-sm sm:text-xl px-6 sm:px-12 py-3 sm:py-7 font-bold shadow-2xl transition-all duration-300 ${
                  playerClass === selectedClass
                    ? 'bg-gradient-to-b from-emerald-600 to-emerald-800 hover:from-emerald-500 hover:to-emerald-700 ring-2 sm:ring-4 ring-emerald-500/50 border border-emerald-500'
                    : 'bg-gradient-to-b from-amber-600 to-amber-800 hover:from-amber-500 hover:to-amber-700 border border-amber-500'
                }`}
              >
                {playerClass === selectedClass ? 'Selected' : 'Select This Hero'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
