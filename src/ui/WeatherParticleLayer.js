const DEFAULT_RAIN_PARTICLE_MAX = 48;
const DEFAULT_SNOW_PARTICLE_MAX = 40;
const DEFAULT_WIND_PARTICLE_MAX = 20;
const DEFAULT_HEAT_PARTICLE_MAX = 24;
const PARTICLE_WEATHERS = new Set(['rain', 'snow', 'windy', 'thunderstorm', 'heat']);

const INTENSITY_FACTORS = {
  none: 0,
  light: 0.18,
  normal: 0.38,
  medium: 0.68,
  heavy: 1,
};

class WeatherParticleLayer {
  constructor(root, config = {}) {
    this.root = root;
    this.config = config || {};
    this.layer = null;
    this.weatherKind = 'unknown';
    this.intensity = 'none';
    this.windIntensity = 'none';
    this.visible = true;
    this.scaleRatio = 1;
    this.particleCounts = { weather: [], wind: [] };
  }

  sync(state = {}, options = {}) {
    const weatherKind = this.normalizeWeatherKind(state.weatherKind);
    const intensity = this.normalizeIntensity(state.intensity);
    const windIntensity = this.normalizeWindIntensity(state.windIntensity, weatherKind, intensity);
    const visible = options.visible !== false;
    const scaleRatio = this.normalizeScaleRatio(options.scaleRatio);
    const pets = this.normalizePets(options.pets);
    const activeWeather = PARTICLE_WEATHERS.has(weatherKind)
      && (intensity !== 'none' || windIntensity !== 'none');

    if (!visible || !activeWeather || pets.length === 0) {
      this.clear();
      this.weatherKind = weatherKind;
      this.intensity = intensity;
      this.windIntensity = windIntensity;
      this.visible = visible;
      this.scaleRatio = scaleRatio;
      this.particleCounts = { weather: [], wind: [] };
      return;
    }

    const isInteracting = Boolean(options.isInteracting || options.interactionOverlayActive);
    const unchangedInputs = this.layer
      && this.weatherKind === weatherKind
      && this.intensity === intensity
      && this.windIntensity === windIntensity
      && this.visible === visible
      && this.scaleRatio === scaleRatio
      && Boolean(this.isInteracting) === isInteracting
      && this._lastPetCount === pets.length;

    let particleCounts;
    if (unchangedInputs) {
      particleCounts = this.particleCounts;
    } else {
      particleCounts = this.getParticleCounts(weatherKind, intensity, windIntensity, pets.length);
      this._lastPetCount = pets.length;
    }

    const unchanged = unchangedInputs;

    this.weatherKind = weatherKind;
    this.intensity = intensity;
    this.windIntensity = windIntensity;
    this.visible = visible;
    this.scaleRatio = scaleRatio;
    this.isInteracting = isInteracting;
    this.particleCounts = particleCounts;

    if (!unchanged) {
      this.rebuildLayer(weatherKind, intensity, windIntensity, scaleRatio, particleCounts);
    }

    this.positionGroups(pets, scaleRatio, options);
  }

  rebuildLayer(weatherKind, intensity, windIntensity, scaleRatio, particleCounts) {
    this.clear();
    this.particleCounts = particleCounts;
    this.layer = document.createElement('div');
    this.layer.id = 'weather-particle-layer';
    this.layer.className = `weather-particle-layer weather-particle-layer--${weatherKind}`;
    this.layer.dataset.weather = weatherKind;
    this.layer.dataset.intensity = intensity;
    this.layer.dataset.windIntensity = windIntensity;
    this.layer.style.setProperty('--weather-effect-scale', scaleRatio);

    const groupCount = Math.max(particleCounts.weather.length, particleCounts.wind.length);
    for (let groupIndex = 0; groupIndex < groupCount; groupIndex++) {
      const group = document.createElement('div');
      group.className = `weather-particle-group weather-particle-group--${weatherKind}`;
      group.dataset.petIndex = String(groupIndex);
      group.style.setProperty('--weather-effect-scale', scaleRatio);

      const visualWeatherKind = weatherKind === 'thunderstorm' ? 'rain' : weatherKind;
      const weatherCount = particleCounts.weather[groupIndex] || 0;
      for (let i = 0; i < weatherCount; i++) {
        group.appendChild(this.createParticle(visualWeatherKind, i, weatherCount));
      }

      const windCount = particleCounts.wind[groupIndex] || 0;
      for (let i = 0; i < windCount; i++) {
        group.appendChild(this.createParticle('wind', i, windCount));
      }

      if (weatherKind === 'thunderstorm') {
        group.appendChild(this.createLightning(groupIndex, 0));
        group.appendChild(this.createLightning(groupIndex, 1));
      } else if (weatherKind === 'heat') {
        group.appendChild(this.createHeatGlow(groupIndex, 0));
        group.appendChild(this.createHeatGlow(groupIndex, 1));
      }

      this.layer.appendChild(group);
    }

    this.root.appendChild(this.layer);
    this._groups = Array.from(this.layer.children);
  }

  clear() {
    if (this.layer) {
      this.layer.remove();
      this.layer = null;
    }
    this._groups = null;
    this._lastPositions = [];
    this.particleCounts = [];
  }

  normalizeWeatherKind(kind) {
    return typeof kind === 'string' ? kind : 'unknown';
  }

  normalizeIntensity(intensity) {
    return Object.prototype.hasOwnProperty.call(INTENSITY_FACTORS, intensity)
      ? intensity
      : 'normal';
  }

  normalizeWindIntensity(windIntensity, weatherKind, intensity) {
    if (weatherKind === 'thunderstorm') {
      return 'none';
    }
    if (Object.prototype.hasOwnProperty.call(INTENSITY_FACTORS, windIntensity)) {
      return windIntensity;
    }
    return weatherKind === 'windy' ? intensity : 'none';
  }

  normalizeScaleRatio(scaleRatio) {
    const value = Number(scaleRatio);
    return Number.isFinite(value) && value > 0 ? value : 1;
  }

  normalizePets(pets) {
    if (!Array.isArray(pets)) return [];
    if (this._lastPetsInput === pets && this._cachedPets && this._cachedPets.length === pets.length) {
      let allValid = true;
      for (let i = 0; i < pets.length; i++) {
        const p = pets[i];
        const c = this._cachedPets[i];
        if (!p || !c) { allValid = false; break; }
        const x = Number(p.x);
        const y = Number(p.y);
        const size = Number(p.size);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(size) || size <= 0) {
          allValid = false;
          break;
        }
        c.x = x;
        c.y = y;
        c.size = size;
      }
      if (allValid) return this._cachedPets;
    }
    const result = pets
      .map((pet) => {
        const x = Number(pet?.x);
        const y = Number(pet?.y);
        const size = Number(pet?.size);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(size) || size <= 0) {
          return null;
        }
        return { x, y, size };
      })
      .filter(Boolean);
    this._lastPetsInput = pets;
    this._cachedPets = result;
    return result;
  }

  getParticleCounts(weatherKind, intensity, windIntensity, petCount) {
    const effectiveWindIntensity = weatherKind === 'thunderstorm' ? 'none' : windIntensity;
    return {
      weather: this.distributeCount(this.getParticleCount(weatherKind, intensity), petCount),
      wind: this.distributeCount(this.getWindParticleCount(effectiveWindIntensity), petCount),
    };
  }

  distributeCount(totalCount, petCount) {
    if (petCount <= 0 || totalCount <= 0) return [];
    const base = Math.floor(totalCount / petCount);
    const remainder = totalCount % petCount;
    return Array.from({ length: petCount }, (_, index) => base + (index < remainder ? 1 : 0));
  }

  hasParticleCounts(nextCounts) {
    return this.hasCountList(this.particleCounts.weather, nextCounts.weather)
      && this.hasCountList(this.particleCounts.wind, nextCounts.wind);
  }

  hasCountList(currentCounts = [], nextCounts = []) {
    return currentCounts.length === nextCounts.length
      && currentCounts.every((count, index) => count === nextCounts[index]);
  }

  _applyGroupStyle(group, index, width, height, left, top, opacity, visibility) {
    if (!this._lastPositions) this._lastPositions = [];
    const cacheKey = `${width}_${height}_${left}_${top}_${opacity}_${visibility}`;
    if (this._lastPositions[index] === cacheKey) return;
    this._lastPositions[index] = cacheKey;

    if (opacity === '0') {
      group.style.opacity = '0';
      group.style.visibility = 'hidden';
    } else {
      group.style.width = `${width}px`;
      group.style.height = `${height}px`;
      group.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      group.style.opacity = '1';
      group.style.visibility = 'visible';
    }
  }

  positionGroups(pets, scaleRatio, options = {}) {
    if (!this.layer || !this._groups) return;
    const groups = this._groups;
    if (!groups.length) return;

    const isInteracting = Boolean(options.isInteracting || options.interactionOverlayActive);
    const overlayEl = (typeof document !== 'undefined' && typeof document.getElementById === 'function')
      ? document.getElementById('interaction-overlay')
      : null;
    const hasOverlay = Boolean(options.interactionOverlayActive || (isInteracting && overlayEl && overlayEl.style && overlayEl.style.opacity !== '0'));

    if (isInteracting && pets.length >= 2 && pets[0] && pets[1]) {
      const petA = pets[0];
      const petB = pets[1];
      const baseWidthA = Math.max(132, petA.size * 1.65) * scaleRatio;
      const baseHeightA = Math.max(120, petA.size * 1.45) * scaleRatio;
      const baseWidthB = Math.max(132, petB.size * 1.65) * scaleRatio;
      const baseHeightB = Math.max(120, petB.size * 1.45) * scaleRatio;

      let cx, cy, mergedWidth, mergedHeight;
      if (hasOverlay && overlayEl && overlayEl.style.left) {
        const overlayLeft = parseFloat(overlayEl.style.left) || 0;
        const overlayTop = parseFloat(overlayEl.style.top) || 0;
        const overlayWidth = parseFloat(overlayEl.style.width) || baseWidthA;
        cx = overlayLeft + overlayWidth / 2;
        cy = overlayTop + overlayWidth * 0.45;
        mergedWidth = overlayWidth * 1.35;
        mergedHeight = baseHeightA * 1.15;
      } else {
        const centerAx = petA.x + (petA.size * scaleRatio) / 2;
        const centerAy = petA.y + (petA.size * scaleRatio) / 2;
        const centerBx = petB.x + (petB.size * scaleRatio) / 2;
        const centerBy = petB.y + (petB.size * scaleRatio) / 2;
        cx = (centerAx + centerBx) / 2;
        cy = (centerAy + centerBy) / 2;
        const dist = Math.abs(centerAx - centerBx);
        mergedWidth = Math.max(baseWidthA * 1.35, dist + baseWidthA * 0.7);
        mergedHeight = Math.max(baseHeightA, baseHeightB) * 1.1;
      }

      const left = cx - mergedWidth / 2;
      const top = cy - mergedHeight * 0.28;

      if (groups[0]) {
        this._applyGroupStyle(groups[0], 0, mergedWidth, mergedHeight, left, top, '1', 'visible');
      }
      if (groups[1]) {
        this._applyGroupStyle(groups[1], 1, 0, 0, 0, 0, '0', 'hidden');
      }
      for (let i = 2; i < groups.length; i++) {
        const group = groups[i];
        const pet = pets[i];
        if (!pet) continue;
        const width = Math.max(132, pet.size * 1.65) * scaleRatio;
        const height = Math.max(120, pet.size * 1.45) * scaleRatio;
        const pLeft = pet.x + (pet.size * scaleRatio) / 2 - width / 2;
        const pTop = pet.y - height * 0.28;
        this._applyGroupStyle(group, i, width, height, pLeft, pTop, '1', 'visible');
      }
      return;
    }

    groups.forEach((group, index) => {
      const pet = pets[index];
      if (!pet) return;
      const width = Math.max(132, pet.size * 1.65) * scaleRatio;
      const height = Math.max(120, pet.size * 1.45) * scaleRatio;
      const left = pet.x + (pet.size * scaleRatio) / 2 - width / 2;
      const top = pet.y - height * 0.28;
      this._applyGroupStyle(group, index, width, height, left, top, '1', 'visible');
    });
  }

  getParticleCount(weatherKind, intensity) {
    if (weatherKind === 'windy') return 0;
    const visualWeatherKind = weatherKind === 'thunderstorm' ? 'rain' : weatherKind;
    let max;
    if (visualWeatherKind === 'snow') {
      max = this.getConfiguredMax('WEATHER_SNOW_PARTICLE_MAX', DEFAULT_SNOW_PARTICLE_MAX);
    } else if (visualWeatherKind === 'heat') {
      max = this.getConfiguredMax('WEATHER_HEAT_PARTICLE_MAX', DEFAULT_HEAT_PARTICLE_MAX);
    } else {
      max = this.getConfiguredMax('WEATHER_RAIN_PARTICLE_MAX', DEFAULT_RAIN_PARTICLE_MAX);
    }
    return Math.max(0, Math.min(max, Math.ceil(max * INTENSITY_FACTORS[intensity])));
  }

  getWindParticleCount(windIntensity) {
    const max = this.getConfiguredMax('WEATHER_WIND_PARTICLE_MAX', DEFAULT_WIND_PARTICLE_MAX);
    return Math.max(0, Math.min(max, Math.ceil(max * INTENSITY_FACTORS[windIntensity])));
  }

  getConfiguredMax(key, fallback) {
    const value = Number(this.config[key]);
    return Number.isInteger(value) && value >= 0 ? value : fallback;
  }

  createParticle(weatherKind, index, total) {
    const particle = document.createElement('i');
    particle.className = `weather-particle weather-particle--${weatherKind}`;
    particle.style.left = `${((index * 37) % 100)}%`;
    particle.style.setProperty('--weather-particle-delay', `${-((index % 12) * 0.23).toFixed(2)}s`);
    particle.style.setProperty('--weather-particle-duration', `${this.getDuration(weatherKind, index)}s`);
    particle.style.setProperty('--weather-particle-drift', `${this.getDrift(weatherKind, index)}px`);
    particle.style.setProperty('--weather-particle-opacity', this.getOpacity(weatherKind, index, total));
    return particle;
  }

  getDuration(weatherKind, index) {
    if (weatherKind === 'wind') return (1.85 + (index % 6) * 0.2).toFixed(2);
    if (weatherKind === 'snow') return (4.8 + (index % 6) * 0.45).toFixed(2);
    if (weatherKind === 'heat') return (1.6 + (index % 6) * 0.28).toFixed(2);
    return (0.85 + (index % 5) * 0.12).toFixed(2);
  }

  getDrift(weatherKind, index) {
    const direction = index % 2 === 0 ? 1 : -1;
    if (weatherKind === 'wind') return 92 + (index % 5) * 13;
    if (weatherKind === 'heat') return direction * (8 + (index % 5) * 4);
    const distance = weatherKind === 'snow' ? 16 + (index % 5) * 7 : 6 + (index % 4) * 3;
    return direction * distance;
  }

  getOpacity(weatherKind, index, total) {
    const spread = total > 0 ? index / total : 0;
    if (weatherKind === 'wind') return (0.52 + (spread % 0.30)).toFixed(2);
    if (weatherKind === 'heat') return (0.26 + (spread % 0.18)).toFixed(2);
    const base = weatherKind === 'snow' ? 0.34 : 0.28;
    return (base + (spread % 0.38)).toFixed(2);
  }

  createLightning(groupIndex, boltIndex) {
    const lightning = document.createElement('b');
    lightning.className = `weather-lightning weather-lightning--${boltIndex + 1}`;
    lightning.style.left = `${34 + boltIndex * 24}%`;
    lightning.style.top = `${8 + ((groupIndex + boltIndex) % 2) * 14}%`;
    lightning.style.setProperty('--weather-lightning-delay', `${-((groupIndex * 0.41) + boltIndex * 1.7).toFixed(2)}s`);
    return lightning;
  }

  createHeatGlow(groupIndex, glowIndex) {
    const glow = document.createElement('b');
    glow.className = `weather-heat-glow weather-heat-glow--${glowIndex + 1}`;
    glow.style.setProperty('--weather-heat-glow-delay', `${-((groupIndex * 0.73) + glowIndex * 1.35).toFixed(2)}s`);
    return glow;
  }
}

if (typeof module !== 'undefined') {
  module.exports = { WeatherParticleLayer };
}
