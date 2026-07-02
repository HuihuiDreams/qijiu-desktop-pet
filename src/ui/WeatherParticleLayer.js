const DEFAULT_RAIN_PARTICLE_MAX = 48;
const DEFAULT_SNOW_PARTICLE_MAX = 40;
const DEFAULT_WIND_PARTICLE_MAX = 20;
const PARTICLE_WEATHERS = new Set(['rain', 'snow', 'windy', 'thunderstorm']);

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

    const particleCounts = this.getParticleCounts(weatherKind, intensity, windIntensity, pets.length);
    const unchanged = this.layer
      && this.weatherKind === weatherKind
      && this.intensity === intensity
      && this.windIntensity === windIntensity
      && this.visible === visible
      && this.scaleRatio === scaleRatio
      && this.hasParticleCounts(particleCounts);

    this.weatherKind = weatherKind;
    this.intensity = intensity;
    this.windIntensity = windIntensity;
    this.visible = visible;
    this.scaleRatio = scaleRatio;
    this.particleCounts = particleCounts;

    if (!unchanged) {
      this.rebuildLayer(weatherKind, intensity, windIntensity, scaleRatio, particleCounts);
    }

    this.positionGroups(pets, scaleRatio);
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
      }

      this.layer.appendChild(group);
    }

    this.root.appendChild(this.layer);
  }

  clear() {
    if (this.layer) {
      this.layer.remove();
      this.layer = null;
    }
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
    return pets
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
  }

  getParticleCounts(weatherKind, intensity, windIntensity, petCount) {
    return {
      weather: this.distributeCount(this.getParticleCount(weatherKind, intensity), petCount),
      wind: this.distributeCount(this.getWindParticleCount(windIntensity), petCount),
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

  positionGroups(pets, scaleRatio) {
    if (!this.layer) return;
    Array.from(this.layer.children).forEach((group, index) => {
      const pet = pets[index];
      if (!pet) return;
      const width = Math.max(132, pet.size * 1.65) * scaleRatio;
      const height = Math.max(120, pet.size * 1.45) * scaleRatio;
      const left = pet.x + (pet.size * scaleRatio) / 2 - width / 2;
      const top = pet.y - height * 0.28;
      group.style.width = `${width}px`;
      group.style.height = `${height}px`;
      group.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    });
  }

  getParticleCount(weatherKind, intensity) {
    if (weatherKind === 'windy') return 0;
    const visualWeatherKind = weatherKind === 'thunderstorm' ? 'rain' : weatherKind;
    const max = visualWeatherKind === 'snow'
      ? this.getConfiguredMax('WEATHER_SNOW_PARTICLE_MAX', DEFAULT_SNOW_PARTICLE_MAX)
      : this.getConfiguredMax('WEATHER_RAIN_PARTICLE_MAX', DEFAULT_RAIN_PARTICLE_MAX);
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
    return (0.85 + (index % 5) * 0.12).toFixed(2);
  }

  getDrift(weatherKind, index) {
    const direction = index % 2 === 0 ? 1 : -1;
    if (weatherKind === 'wind') return 92 + (index % 5) * 13;
    const distance = weatherKind === 'snow' ? 16 + (index % 5) * 7 : 6 + (index % 4) * 3;
    return direction * distance;
  }

  getOpacity(weatherKind, index, total) {
    const spread = total > 0 ? index / total : 0;
    if (weatherKind === 'wind') return (0.34 + (spread % 0.34)).toFixed(2);
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
}

if (typeof module !== 'undefined') {
  module.exports = { WeatherParticleLayer };
}
