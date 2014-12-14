/**
 * 
 * Operations on files from local storage
 * @namespace
 * @name LocalStorage
 * @public
 * @memberOf GFS
 * 
 */
var LocalStorage = (function() {
	
	var exports = {};
	
	
	/**
	 * Returns error message
	 * @public
	 * @name LocalStorage#getFileErrorMsg
	 * @function
	 * @memberOf LocalStorage
	 * @param {Number} e local storage error code
	 * @return {String} plain text error message
	 */
	var getFileErrorMsg = function(e) {
		switch (e.code) {
		case FileError.QUOTA_EXCEEDED_ERR:
			return 'QUOTA_EXCEEDED_ERR';
		case FileError.NOT_FOUND_ERR:
			return 'NOT_FOUND_ERR';
		case FileError.SECURITY_ERR:
			return 'SECURITY_ERR';
		case FileError.INVALID_MODIFICATION_ERR:
			return 'INVALID_MODIFICATION_ERR';
		case FileError.INVALID_STATE_ERR:
			return 'INVALID_STATE_ERR';
		default:
			return 'Unknown Error';
		};
	};
	exports.getFileErrorMsg = getFileErrorMsg;
	
	
	/**
	 * Returns local storage file system handle
	 * @public
	 * @name LocalStorage#getFileSystem
	 * @function
	 * @memberOf LocalStorage
	 * @return {LocalFileSystem} local file system
	 */
	var getFileSystem = (function() {
		
		// singleton instance
		var _fs = undefined;
		return function(cb) {
			if (_fs) {
				if (cb)
					cb(_fs);
			}
			else {
				if (!window.webkitStorageInfo) {
					// FS API not supported here (e.g firefox 13)
					cb();
					return;
				}
				
				// Note: The file system has been prefixed as of Google Chrome 12:
				window.requestFileSystem  = window.requestFileSystem || window.webkitRequestFileSystem;
				window.BlobBuilder = window.BlobBuilder || window.WebKitBlobBuilder;
				
				window.webkitStorageInfo.requestQuota(
						PERSISTENT,
						500*1024*1024,
						function(grantedBytes) {
							window.requestFileSystem(
									PERSISTENT,
									grantedBytes,
									function(fs) {
										console.log('acquired filesystem: ', fs);
										_fs = fs;
										if (cb)
											cb(_fs);
									},
									function(e) {
										console.log('filesystem error: ', e);
										alert('filesystem not accessible!');
									}
							);
						}, 
						function(e) {
							console.log('requestQuota error', e);
						}
				);
			}
		};
	})();
	exports.getFileSystem = getFileSystem;
	
	
	/**
	 * Returns all files from local file system
	 * @public
	 * @name LocalStorage#getAllFiles
	 * @function
	 * @memberOf LocalStorage
	 * @param {Function} cb callback operation for file entries array
	 */
	exports.getAllFiles = function(cb) {
		
		getFileSystem(function(fs) {
			
			if (!fs) {
				// FS API not available
				cb();
				return;
			}
			
			var dirReader = fs.root.createReader();
			var entries = [];
			
			// Call the reader.readEntries() until no more results are returned.
			var readEntries = function() {
				dirReader.readEntries(function(results) {
					var i;
					if (!results.length) {
						// call cb with array of entries
						cb(entries);
					} else {
						// results is an EntryArray != regular Array
						for (i=0; i<results.length; ++i) {
							entries.push(results[i]);
						}
						readEntries();
					}
				}, 
				function(e) {
					console.log('error listing store fs: '+getFileErrorMsg(e));
				});
			};
			readEntries(); // Start reading dirs.
		});
	};
	
	
	/**
	 * Create a new file in given file system
	 * @public
	 * @name #createFile
	 * @function
	 * @memberOf LocalStorage
         * @param {FileSystem} fs
	 * @param {String} name name of file
	 * @param {Function} cb callback for end of creation
	 */
	exports.createFile = function(fs, name, cb) {
		// FIXME: set exclusive=true to detect if file already exists
		fs.root.getFile(
				name,
				{create: true, exclusive: false},
				function(entry) {
					console.log('created file '+entry.fullPath);
					if (cb)
						cb(entry);
				},
				function(error) {
					console.log('failed to create file '+name+': '+getFileErrorMsg(error));
				}
		);
		return fs;
	};
	
	
	/**
	 * Write data to file
	 * @public
	 * @name #writeToFile
	 * @function
	 * @memberOf LocalStorage
	 * @param {FileEntry} entry file entry
	 * @param {Blob} data binary data
	 * @param {Function} cb callback for end of write
	 */
	exports.writeToFile = function(entry, data, cb) {
		// Create a FileWriter object for our FileEntry
		entry.createWriter(
				function(fileWriter) {
					fileWriter.onwriteend = function(e) {
						console.log('write completed for '+entry.name);
						if (cb)
							cb(true);
					};
					fileWriter.onerror = function(error) {
						console.log('error writing '+entry.name+': ' + error.toString());
						if (cb)
							cb(false);
					};
					fileWriter.write(data); //bb.getBlob('application/octet-stream'));
				},
				function(error) {
					console.log('failed to create writer for file '+entry.name+': '+getFileErrorMsg(error));
					if (cb)
						cb(false);
				}
		);
		return entry;
	};
	
	
	return exports;
	
})(); // end of LocalStorage


var mozLocalStorage = {
};

// exports.LocalStorage = LocalStorage;
// return exports;

// })(GFS);
