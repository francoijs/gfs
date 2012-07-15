crx:
	rsync -r  src lib gfx gfs.html manifest.json build/chrome/gfs/
	./crxmake.sh build/chrome/gfs gfs.pem

xpi:
	rm -f gfs.xpi
	rsync -r  src lib gfx gfs.html build/firefox/gfs/chrome/content/
	cd build/firefox/gfs && zip -r ../../../gfs.xpi * && cd -

doc: src/gsearch.js
	./doc.sh
