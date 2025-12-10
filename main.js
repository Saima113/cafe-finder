const apiKey = CONFIG.GOOGLE_MAPS_API_KEY;
let allCafes = []; // Store all cafes for filtering
let currentLocation = { lat: 0, lng: 0 };

function getLocation() {
  console.log("Getting your location to find cafes...");
  
  if (!navigator.geolocation) {
    alert("Geolocation is not supported. Showing Delhi cafes by default.");
    searchCitywide(28.6139, 77.2090, "Delhi");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      console.log(`Got location: ${lat}, ${lng}`);
      
      // Get city name from coordinates
      getCityName(lat, lng);
    },
    (error) => {
      console.error("Geolocation error:", error);
      alert("Location access denied. Showing Delhi cafes by default.");
      searchCitywide(28.6139, 77.2090, "Delhi");
    }
  );
}

async function getCityName(lat, lng) {
  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`
    );
    const data = await response.json();
    
    if (data.results && data.results[0]) {
      const addressComponents = data.results[0].address_components;
      const city = addressComponents.find(c => c.types.includes('locality'))?.long_name || 'your area';
      console.log(`Searching cafes in ${city}`);
      searchCitywide(lat, lng, city);
    } else {
      searchCitywide(lat, lng, "your area");
    }
  } catch (e) {
    console.error("Geocoding error:", e);
    searchCitywide(lat, lng, "your area");
  }
}

async function searchCitywide(lat, lng, cityName) {
  currentLocation = { lat, lng };
  
  // Show loading message
  const container = document.querySelector('.cards');
  container.innerHTML = `
    <div style="text-align: center; padding: 40px;">
      <div style="font-size: 60px;"></div>
      <p style="font-size: 18px; margin-top: 20px;">Finding cafes in ${cityName}...</p>
    </div>
  `;
  
  // Search multiple radiuses to get more variety
  const searches = [
    { radius: 5000, count: 20 },   // Nearby - 5km
    { radius: 10000, count: 20 },  // Medium - 10km
    { radius: 15000, count: 20 }   // Far - 15km
  ];
  
  let allCafesFound = [];
  
  for (const search of searches) {
    const cafes = await searchWithRadius(lat, lng, search.radius, search.count);
    if (cafes) allCafesFound = allCafesFound.concat(cafes);
  }
  
  if (allCafesFound.length > 0) {
    // Remove duplicates
    const uniqueCafes = Array.from(new Map(allCafesFound.map(c => [c.id, c])).values());
    
    // Separate into popular and hidden gems
    const popular = uniqueCafes.filter(c => (c.userRatingCount || 0) > 100);
    const hiddenGems = uniqueCafes.filter(c => (c.userRatingCount || 0) <= 100 && (c.rating || 0) >= 4.0);
    
    // Sort popular by score
    popular.sort((a, b) => {
      const scoreA = (a.rating || 0) * Math.log((a.userRatingCount || 0) + 1);
      const scoreB = (b.rating || 0) * Math.log((b.userRatingCount || 0) + 1);
      return scoreB - scoreA;
    });
    
    // Sort hidden gems by rating
    hiddenGems.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    
    // Mix them: 2 popular, 1 hidden gem pattern
    const mixed = [];
    let popIdx = 0, gemIdx = 0;
    
    while (popIdx < popular.length || gemIdx < hiddenGems.length) {
      if (popIdx < popular.length) mixed.push(popular[popIdx++]);
      if (popIdx < popular.length) mixed.push(popular[popIdx++]);
      if (gemIdx < hiddenGems.length) mixed.push(hiddenGems[gemIdx++]);
    }
    
    allCafes = mixed.slice(0, 60); // Up to 60 cafes total!
    console.log(`Found ${allCafes.length} cafes (${popular.length} popular, ${hiddenGems.length} hidden gems)`);
    displayCards(allCafes);
    showFilterControls();
  } else {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px;">
        <div style="font-size: 80px;">😢</div>
        <p style="font-size: 18px; margin-top: 20px;">No cafes found in ${cityName}</p>
        <p style="font-size: 14px; color: #6c584c;">Try a different location!</p>
      </div>
    `;
  }
}

async function searchWithRadius(lat, lng, radius, maxResults) {
  const endpoint = `https://places.googleapis.com/v1/places:searchNearby`;
  
  const requestBody = {
    includedTypes: ["cafe"],
    maxResultCount: maxResults,
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: radius
      }
    }
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.displayName,places.id,places.rating,places.photos,places.location,places.userRatingCount'
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();
    
    if (data.error) {
      console.error("API Error:", data.error);
      return [];
    }
    
    return data.places || [];
  } catch (e) {
    console.error("Error fetching Places API:", e);
    return [];
  }
}

function showFilterControls() {
  // Add filter controls if they don't exist
  if (document.querySelector('.filter-controls')) return;
  
  const controls = document.createElement('div');
  controls.className = 'filter-controls';
  controls.innerHTML = `
    <label>
      Min Rating:
      <select id="ratingFilter" onchange="applyFilters()">
        <option value="0">All</option>
        <option value="3">3+ ⭐</option>
        <option value="4">4+ ⭐</option>
        <option value="4.5">4.5+ ⭐</option>
      </select>
    </label>
    <label>
      Type:
      <select id="typeFilter" onchange="applyFilters()">
        <option value="all">All Cafes</option>
        <option value="popular">Popular (100+ reviews)</option>
        <option value="hidden">Hidden Gems (< 100 reviews)</option>
      </select>
    </label>
    <label>
      Sort by:
      <select id="sortFilter" onchange="applyFilters()">
        <option value="mixed">Best Mix</option>
        <option value="rating">Highest Rating</option>
        <option value="reviews">Most Reviewed</option>
      </select>
    </label>
    <button onclick="showMap()">📍 Map View</button>
  `;
  
  const container = document.querySelector('.cards');
  container.parentElement.insertBefore(controls, container);
}

function applyFilters() {
  const minRating = parseFloat(document.getElementById('ratingFilter').value);
  const typeFilter = document.getElementById('typeFilter').value;
  const sortBy = document.getElementById('sortFilter').value;
  
  let filtered = allCafes.filter(cafe => {
    const rating = cafe.rating || 0;
    const reviewCount = cafe.userRatingCount || 0;
    
    // Apply rating filter
    if (rating < minRating) return false;
    
    // Apply type filter
    if (typeFilter === 'popular' && reviewCount <= 100) return false;
    if (typeFilter === 'hidden' && reviewCount > 100) return false;
    
    return true;
  });
  
  // Apply sorting
  if (sortBy === 'rating') {
    filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  } else if (sortBy === 'reviews') {
    filtered.sort((a, b) => (b.userRatingCount || 0) - (a.userRatingCount || 0));
  }
  // 'mixed' keeps the original mixed order
  
  displayCards(filtered);
}

function displayCards(cafes) {
  const container = document.querySelector('.cards');
  container.innerHTML = '';
  
  if (cafes.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px;">
        <div style="font-size: 80px;">🐹☕️</div>
        <p style="font-size: 18px; margin-top: 20px;">No cafes match your filters</p>
        <p style="font-size: 14px; color: #6c584c;">Try adjusting your filters!</p>
      </div>
    `;
    return;
  }
  
  cafes.forEach((cafe, i) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'swipe-wrapper';
    wrapper.style.zIndex = 200 - i;

    const card = document.createElement("div");
    card.className = "location-card";

    const imgUrl = cafe.photos?.[0]?.name
      ? `https://places.googleapis.com/v1/${cafe.photos[0].name}/media?maxWidthPx=400&key=${apiKey}`
      : "https://via.placeholder.com/250x150?text=No+Image";
    
    const cafeData = {
      name: cafe.displayName?.text || cafe.displayName || "Unknown Cafe",
      place_id: cafe.id,
      photo: imgUrl,
      rating: cafe.rating || "N/A",
      location: cafe.location
    };

    card.innerHTML = `
      <img src="${imgUrl}" alt="${cafeData.name}" />
      <h3>${cafeData.name}</h3>
      <p>⭐️ Rating: ${cafeData.rating}</p>
      <p><small>Swipe right to save 💖</small></p>
    `;

    const hammertime = new Hammer(wrapper);
    
    hammertime.on("swipeleft", () => {
      wrapper.style.transform = "translateX(-150%) rotate(-15deg)";
      wrapper.style.opacity = 0;
      setTimeout(() => wrapper.remove(), 300);
    });
    
    hammertime.on("swiperight", () => {
      saveCafe(JSON.stringify(cafeData));
      wrapper.style.transform = "translateX(150%) rotate(15deg)";
      wrapper.style.opacity = 0;
      setTimeout(() => wrapper.remove(), 300);
    });

    wrapper.appendChild(card);
    container.appendChild(wrapper);
  });
}

function showMap() {
  if (!window.google || !window.google.maps) {
    alert("Google Maps is not loaded. Please add the Maps JavaScript API script to your HTML.");
    return;
  }

  const container = document.querySelector('.cards');
  container.innerHTML = `
    <div id="map" style="width: 100%; height: 500px; border-radius: 10px;"></div>
    <button onclick="getLocation()" style="margin-top: 10px;">Back to Card View</button>
  `;
  
  // Wait for DOM to be ready
  setTimeout(() => {
    // Initialize Google Map
    const map = new google.maps.Map(document.getElementById('map'), {
      center: currentLocation,
      zoom: 14
    });
    
    // Add marker for user location
    new google.maps.Marker({
      position: currentLocation,
      map: map,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: '#4285F4',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2
      },
      title: 'You are here'
    });
    
    // Add markers for cafes
    allCafes.forEach(cafe => {
      if (cafe.location) {
        const marker = new google.maps.Marker({
          position: {
            lat: cafe.location.latitude,
            lng: cafe.location.longitude
          },
          map: map,
          title: cafe.displayName?.text || cafe.displayName
        });
        
        const infoWindow = new google.maps.InfoWindow({
          content: `
            <div style="padding: 10px;">
              <h3>${cafe.displayName?.text || cafe.displayName}</h3>
              <p>⭐️ ${cafe.rating || 'N/A'}</p>
            </div>
          `
        });
        
        marker.addListener('click', () => {
          infoWindow.open(map, marker);
        });
      }
    });
  }, 100);
}

function saveCafe(cafeJSON) {
  const cafe = JSON.parse(cafeJSON);
  let saved = JSON.parse(localStorage.getItem('savedCafes') || '[]');
  
  if (!saved.find((c) => c.place_id === cafe.place_id)) {
    saved.push(cafe);
    localStorage.setItem("savedCafes", JSON.stringify(saved));
    showToast(`💖 ${cafe.name} saved!`);
  } else {
    showToast(`you have already saved ${cafe.name} , dumbo.`);
  }
}

function showToast(message) {
  // Remove any existing toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  // Create new toast
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  // Show toast with animation
  setTimeout(() => toast.classList.add('show'), 10);
  
  // Remove toast after 2 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

function showSaved() {
  const container = document.querySelector('.cards');
  container.innerHTML = '';
  
  // Remove filter controls if they exist
  const filterControls = document.querySelector('.filter-controls');
  if (filterControls) filterControls.remove();
  
  const saved = JSON.parse(localStorage.getItem("savedCafes") || "[]");
  
  if (saved.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px;">
        <div style="font-size: 80px;">🐹💔</div>
        <p style="font-size: 18px; margin-top: 20px;">No saved cafes yet</p>
        <p style="font-size: 14px; color: #6c584c;">Start swiping right to save your favorites!</p>
      </div>
    `;
    return;
  }
  
  saved.forEach(cafe => {
    const card = document.createElement('div');
    card.className = 'location-card';
    card.innerHTML = `
      <img src="${cafe.photo}" alt="${cafe.name}" />
      <h3>${cafe.name}</h3>
      <p>⭐️ Rating: ${cafe.rating}</p>
    `;
    container.appendChild(card);
  });
}