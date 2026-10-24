<div align="center">

<img src="https://raw.githubusercontent.com/Mnemosyne-OS/Mnemosyne-Neural-OS/main/assets/banner-mnemosyne-os.png" width="100%" alt="Mnemosyne OS — Your memory. Your machine. Your rules." />

🌐 [**mnemosyne-os.io**](https://mnemosyne-os.io) — the product&ensp;·&ensp;[**mnemosyne-os.com**](https://mnemosyne-os.com) — for organizations&ensp;·&ensp;📖 [**docs.mnemosyne-os.io**](https://docs.mnemosyne-os.io) — the documentation

</div>

# MnemoClima

The world's climate on a map and a timeline you can move, inside Mnemosyne OS.

- **The Pacific.** NOAA's opinion on El Niño and La Niña, with its date and its words, and the
  ocean index (ONI) since 1950.
- **The heat in the ocean.** Sea surface temperature against normal (NOAA OISST), on a flat map
  or a globe.
- **Disasters.** Alerts in progress (GDACS, NASA EONET, USGS), and their history on demand:
  cyclone tracks (IBTrACS), earthquakes, droughts and floods.
- **My places.** Put a point on the map: rain and temperature month by month since 1981 (NASA
  POWER), and what happened there after each strong El Niño, with N shown.
- **Markers.** Places that react early (Southern California) or pay later (Guatemala's Dry
  Corridor, with FEWS NET's food-security phase). Add your own.
- **Memory.** Pour El Niño, NOAA's opinion and your places into a Memory Pack the chat can read.
  Watch El Niño while the window is closed, pin it on the board, share the numbers with other
  apps.

Nothing here is a forecast of ours: what looks ahead is NOAA's, dated; what is computed is the
past.

## Sources

NOAA Climate Prediction Center, NOAA Physical Sciences Laboratory, NASA GISTEMP, NOAA OISST
(via CoastWatch ERDDAP), NASA POWER, GDACS (European Commission JRC), NASA EONET, USGS, NOAA
IBTrACS, FEWS NET, Natural Earth. The data are read from the sources by the person's machine and
are not shipped with the cartridge (apart from Natural Earth's country shapes, public domain).

## Develop

```bash
pnpm --filter @mnemosyne-plugins/mnemo-clima dev
```

Port 5238. In a plain browser the sources without CORS go through Vite relays (dev only);
inside Mnemosyne the host reads them.

MIT.

## Where Mnemosyne OS lives

This cartridge runs inside **Mnemosyne OS**, the sovereign, local-first memory operating system published by XPACEGEMS LLC. Its official addresses:

- Product site: <https://mnemosyne-os.io>
- Organizations: <https://mnemosyne-os.com>
- Documentation: <https://docs.mnemosyne-os.io>
- Host source: <https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS>
- Packages: the npm scope `@mnemosyne_os`

---

<sub>**[Mnemosyne OS](https://mnemosyne-os.io)** — the sovereign, local-first memory OS this cartridge runs in.
Get it at [mnemosyne-os.io/download](https://mnemosyne-os.io/download), install cartridges from the built-in MnemoHub store, or [build your own](https://mnemosyne-os.io/dev).</sub>
