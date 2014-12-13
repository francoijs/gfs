/**
 * @fileOverview GFS file search & download
 * @author fschneider
 * @version: 0.1
 */


google.load('search', '1');


//jQuery custom extension
$.expr[":"].containsNoCase = function(el, i, m) {
	var search = m[3];
	if (!search) 
		return false;
	return eval("/" + search + "/i").test($(el).text());
};


/**
 * 
 * Global namespace
 * @namespace
 * @name GFS
 * 
 */
GFS = (function() {
	
var exports = {};



/**
 * 
 * Constants
 * @namespace
 * @name Constants
 * @private
 * @memberOf GFS
 * 
 */
var Constants = {
		
	/**
	 * @private
	 * @memberOf Constants
	 */ 
	Images: {
		LOADING	: 'gfx/loading.gif',
		OK		: 'gfx/ok.png',
		ERROR	: 'gfx/error.png',
		WARNING : 'gfx/warning.png'
	},
	
	Selectors: {
		DOWNLOADER_FORM : '#downloader',
		DOWNLOADING_LIST: '#downloading',
		RESULTS_COUNT	: '#resultsCount',
		RESULTS_LIST	: '#results',
		DOWNLOAD_BUTTONS: '#dlButtons input',
		QUERY_TEXT		: '#myText',
		MAX_DOWNLOADS	: '#maxDownloads',
		EXTENSIONS_LIST	: '#extensionsList',
		MAX_RESULTS		: '#maxResults'
	},
	
	Search: {
		CSE_ID: '016386776976794753561:j8wxgigr7g4'
	}
};
exports.Constants = Constants;


/**
 * 
 * Parser of remote open directories
 * @namespace
 * @name Parser
 * @private
 * @memberOf GFS
 * 
 */
var Parser = (function(){

	/**
	 * Parse content of dir layed out as a table with icons where 'alt' is [DIR] and [SND]
	 * ex: https://notendur.hi.is/shl1/birna/Arcade%20Fire/The%20Suburbs/
	 * or: http://simant.ru/pub/multimedia/mp3/%5B-=Foreign=-%5D/S/Slayer//2006-christ%20illusion/
	 * @private
	 * @memberOf Parser
	 */ 
	var DIR = (function(){
		
		function getElementsFromTable(table, path, query) {
			var ret = [];
			// get lines with img [SND] or [DIR]
			var snd = table.find('img[alt="[SND]"]');
			var dirs = table.find('img[alt="[DIR]"]');
			// get links in next columns
			snd.parents('td').next('td').find('a').each(function(i, a) {
				// url is either attr href (as in http://138678.activeboard.com/t42662121/index-of-publicmp3metallica/)
				// or pathname (as in https://notendur.hi.is/shl1/birna/Arcade%20Fire/The%20Suburbs/)
				var url = new URI(a.href);
				ret.push(Elements.create(path + url.filename(), a.text));
			});
			dirs.parents('td').next('td').find('a').each(function(i, a) {
				if (a.text !== 'Parent Directory')
					// add dir 
					ret.push(Elements.create(path + a.pathname, a.text, query));
			});
			return ret;
		}
		
		return { 
			getElements: function(data, query, path) {
				var links = $('img[alt="[DIR]"]', data);
				if (links.length) {
					// get parent table
					var table = links.parents('table');
					if (table.length)
						return getElementsFromTable(table, path, query);
				}
			}
		};
	})();
	

	/**
	 * Parse content of dir layed out as successive anchors
	 * (Apache 2, LiteSpeed Web Server)
	 * ex: http://bryanbryan.com/music/nope/Arcade%20Fire%20%5BDiscography%5D/2003%20-%20Arcade%20Fire/
	 * @private
	 * @name Parser#PRE
	 * @memberOf Parser
	 */ 
	var PRE = (function(){

		return { 
			getElements: function(data, query, path) {
				var ret = undefined;
				var links = $('a[href]', data).filter(function() {
				    return $.trim(this.text) === 'Parent Directory';
				});
				// get all following anchors except 'folder'
				links.nextAll('a[href!="folder.jpg"]').each(function(i, a) {
					ret = ret || [];
					var url = new URI(a.href);
					ret.push(Elements.create(path + url.filename(), a.text, query));
				});
				return ret;
			}
		};
	})();


	/**
	 * Parse content of dir layed out as a unordered list (UL) of anchors
	 * (Apache/2.2.21, Proxad ?)
	 * ex: http://vindweb.nl/muziek/Metal/Slayer%20-%20MP3%20Discography%20(1983%20-%202009)/1994%20-%20Divine%20Intervention/
	 * @private
	 * @name Parser#UL
	 * @memberOf Parser
	 **/ 
	var UL = (function(){
		
		return {
			getElements: function(data, query, path) {
				var ret = undefined;
				var links = $('a[href]', data).filter(function() {
				    return $.trim(this.text) === 'Parent Directory';
				});
				// get all following anchors
				links.parent('LI').nextAll().children('A').each(function(i, a) {
					ret = ret || [];
					var url = new URI(a.href);
					ret.push(Elements.create(path + url.filename(), a.text, query));
				});
				return ret;
			}
		};
	})();

	
	/**
	 * Parse document to retrieve listed files and directories 
	 * @public
	 * @name getElements
	 * @memberOf Parser
	 * @function
	 * @param {String} data document content
	 * @param {Query} query filter
	 * @param {String} path document path
	 * @return {Array} array of elements
	 */
	return {
		getElements: function(data, query, path) {
			return DIR.getElements(data, query, path)
				|| PRE.getElements(data, query, path)
				|| UL.getElements(data, query, path);
		}
	};
	
})(); // end of Parser




/**
 * 
 * Remote or local elements management
 * @namespace
 * @name Elements
 * @private
 * @memberOf GFS
 * 
 */
var Elements = (function() {
	
	var exports = {};
	

	/**
	 * Directory
	 * @name Directory
	 * @memberOf Elements
	 */
	function Directory(url, name, query) {
		this._elements = undefined;
		this._name = name;
		this._query = query;
		this._uri = new URI(url);
		this._checkBoxJElement = undefined;
		this._listJElement = undefined;
		this._imgJElement = undefined;
		this._titleJElement = undefined;
	};
	
	Directory.prototype = {
			
			/**
			 * List content of remote directory
			 * @private
			 * @name Directory#_explore
			 * @memberOf Directory
			 * @function
			 * @param {Search.Query} query filter query
			 * @param {Function} cb callback for end of exploration
			 * @return {Directory} self
			 */
			_explore: function(query, cb) {
				// check hostname
				if (!query.isValid(this._uri)) {
					console.log(this._uri.toString()+' is blacklisted!');
					cb();
					return this;
				}
				console.log('fetching '+this._uri.toString()+'...');
				// result
				var els = undefined;
				// xhr
				var self = this;
				$.ajax({
					url: this._uri.toString(),
					cache: false,
					dataType: "html",
					error: function() {
						console.log("url "+self._uri.toString()+" could not be loaded");
						cb();
					},
					success: function(data) {			
						// compensate for a potential trimming of <html> and <body> tags by browser
						// (see http://stackoverflow.com/questions/8625928/parse-and-handle-dom-that-came-as-a-string-input)
						data = '<div>'+data+'</div>';
						
						// look for a title such as 'Index of ...'
						var h1 = $("TITLE:contains('Index of ')", data);
						if (h1.length) {
							var text = h1[0].textContent;
							self._name = text.slice('Index of '.length);
							var path = self._uri.toString();
							// removes any trailing char after last '/'
							var sl = path.lastIndexOf('/')+1;
							if (sl && sl<path.length)
								path = path.slice(0, sl);
							console.log('scanning '+path+'...');
							els = Parser.getElements(data, self._query, path);
							if (els) {
								console.log('got '+els.length+' results from '+path);
							}
						}
						else {
							console.log('unable to parse content of '+path);
						}
						cb(els);
					}
				});
				return this;
			},
			
			/**
			 * Filter list of elements
			 * @private
			 * @name Directory#_explore
			 * @memberOf Directory
			 * @function
			 * @param {Array} els array of elements
			 * @return {Array} filtered result
			 */
			_filter: function(els) {
				var res = [];
				// does the dir path match request?
				if (this._query.matchUri(this._uri)) {
					// keep all elements
					res = els;
				}
				else {
					// keep only elements whose name matches request
					var self = this;
					els.forEach(function(l) {
						if (self._query.matchName(l.getName()) && self._query.matchExt(l.getName())) {
							res.push(l);
							
						}
					});
					console.log(res.length+' elements of '+this._name+' match request');
				}
				return res;
			},
			
			/**
			 * Display content of directory
			 * @private
			 * @name Directory#_expand
			 * @memberOf Directory
			 * @function
			 * @param {jQuery} target jQuery element for clickable directory name
			 * @return {Directory} self
			 */
			_expand: function(target) {
				var self = this;
				this.getElements(function(els) {
					if (!els) return;
					els.forEach(function(l) {
						var f = exports.create(l.getURL(), l.getURL(), self._query);
						f.addToResults(self._listJElement);
					});
					// show checkbox
					if (els.length)
						self._checkBoxJElement.css('visibility','visible');
				});
				// next click collapses
				target.unbind("click").click(function(e) {
					e.stopPropagation();
					self._collapse(target);
					return false;
				});
				return this;
			},
			
			/**
			 * Hide content of directory
			 * @private
			 * @name Directory#_collapse
			 * @memberOf Directory
			 * @function
			 * @param {jQuery} target jQuery element for clickable directory name
			 * @return {Directory} self
			 */
			_collapse: function(target) {
				// remove children
				target.off('click');
				this._listJElement.text('');
				// hide checkbox
				this._checkBoxJElement.css('visibility','hidden').attr('checked', false);
				// next click will expand
				var self = this;
				target.unbind("click").click(function(e) {
					e.stopPropagation();
					self._expand(target);
					return false;
				});
				return this;
			},
			
			
			/**
			 * Select directory in list
			 * @private
			 * @name Directory#_select
			 * @memberOf Directory
			 * @function
			 * @param {jQuery} jel jQuery checkbox element
			 */
			_select: function(jel) {
				jel.data('myObject', this).attr('checked', true);
				this._listJElement.find("input[type='checkbox']")
					.attr('checked', true).change();
			},
			
			/**
			 * Unselect directory in list
			 * @private
			 * @name Directory#_unselect
			 * @memberOf Directory
			 * @function
			 * @param {jQuery} jel jQuery checkbox element
			 */
			_unselect: function(jel) {
				jel.removeData('myObject').attr('checked', false);
				this._listJElement.find("input[type='checkbox']")
					.attr('checked', false).change();
			},

			/**
			 * Return URL of directory
			 * @public
			 * @name Directory#getURL
			 * @function
			 * return {String} URL of directory
			 */
			getURL: function() {
				return this._uri.toString();
			},
			
			/**
			 * Return name of directory
			 * @public
			 * @name Directory#getName
			 * @function
			 * @return {String} URL of directory
			 */
			getName: function() {
				return this._name;
			},
			
			/**
			 * Retrieve elements of directory
			 * @public
			 * @name Directory#getElements
			 * @function
			 * @param {Function} cb callback
			 */
			getElements: function(cb) {
				if (!this._elements) {
					// status=loading
					if (this._imgJElement)
						this._imgJElement.attr('src', Constants.Images.LOADING)
							.css('visibility', 'visible');
					// scan remote directory
					var self = this;
					this._explore(this._query, function(els) {
						if (!els) {
							// status=error
							if (self._imgJElement)
								self._imgJElement.attr('src', Constants.Images.ERROR);
							self._elements = undefined;
						}
						else {
							// status=ok
							if (self._imgJElement)
								self._imgJElement.attr('src', Constants.Images.OK);								
							self._elements = self._filter(els);
						}
						if (cb)
							cb(self._elements);
					}); 
				}
				else
					cb(this._elements);
			},
			
			/**
			 * Display directory in results list
			 * @public
			 * @name Directory#addToResults
			 * @function
			 * @param {DOMElement} parent parent DOM element
			 * @return {DOMElement} new link DOM element
			 */
			addToResults: function(parent) {
				var el = $("<input type='checkbox'></input><img width=16 height=16></img><a href='#'>" 
						+ this._uri.toString() + "</a>" + " : " 
						+ this._name + "<br><div></div>");
				// prepend with a checkbox
				var self = this;
				this._checkBoxJElement = el.first()
					.change(function() {
						if (el.attr('checked'))
							self._select(self._checkBoxJElement);
						else
							self._unselect(self._checkBoxJElement);
					})
					.css('visibility','hidden');
				// status image
				this._imgJElement = el.eq(1)
					.css('visibility','hidden');
				// click expands directory content
				this._titleJElement = el.eq(2);
				var self = this;
				this._titleJElement.unbind("click").click(function(e) {
					e.stopPropagation();
					self._expand(self._titleJElement);
					return false;
				});
				// container for sub-elements
				this._listJElement = el.last()
					.css('padding-left', '2em');
				el.appendTo(parent);
				return this._listJElement;
			},
			
			/**
			 * Stub: dirs cannot be saved
			 * @public
			 * @name Directory#saveToFile
			 * @function
			 * @param {FileSystem} fs target filesystem
			 * @param {Function} cb callback for end of write
			 */
			saveToFile: function(fs, cb) {
				this._checkBoxJElement.attr('checked', false);
				if (cb)
					cb(false);
			},
			
			/**
			 * Display content of directory
			 * @public
			 * @name Directory#open
			 * @memberOf Directory
			 * @function
			 * @return {Directory} self
			 */
			open: function() {
				if (this._titleJElement)
					this._expand(this._titleJElement);
				return this;
			}
	};
	
	
	/**
	 * Create object Directory
	 * @private
	 * @name createDir
	 * @memberOf Elements
	 * @function
	 * @param {String} url url of directory
	 * @param {String} name given name
	 * @param {Query} query query object for elements filtering
	 * @return {Directory} new Directory object
	 */
	function createDir(url, name, query) {
		
		return new Directory(url, name, query);
	}

	
	/**
	 * Create object File
	 * @public
	 * @name createFile
	 * @function
	 * @memberOf Elements
	 * @param {String} url url of file
	 * @param {Entry} entry optional local FS file entry
	 * @return {File} new File object
	 */
	function createFile(url, entry) {
		
		return new File(url, entry);
	}
	
		
	/**
	 * File
	 * @name File
	 * @memberOf Elements
	 */
	function File(url, entry) {
		
		// extract file name from url
		this._uri = new URI(url);
		// FIXME: when _uri contains a query, filename returns ""
		this._name = unescape(this._uri.filename());
		this._listJElement = undefined;
		this._localFSEntry = entry;
		this._statusJElement = undefined;
		this._localJElement = undefined;
	};		
	
	File.prototype = {
			
			/**
			 * Select file in list
			 * @private
			 * @name File#_select
			 * @memberOf File
			 * @function
			 * @param {jQuery} jel jQuery checkbox element
			 */
			_select: function(jel) {
				jel.data('myObject', this).attr('checked', true);
			},
			
			/**
			 * Unselect file in list
			 * @private
			 * @name File#_unselect
			 * @memberOf File
			 * @function
			 * @param {jQuery} jel jQuery checkbox element
			 */
			_unselect: function(jel) {
				jel.removeData('myObject').attr('checked', false);
			},

			/**
			 * Return URL of file
			 * @public
			 * @name File#getURL
			 * @function
			 * @return {String} URL of file
			 */
			getURL: function() {
				return this._uri.toString();
			},
			
			
			/**
			 * Return URL of file on the local filesystem
			 * @public
			 * @name File#getLocalURL
			 * @function
			 * @return {String} local URL of file
			 */
			getLocalURL: function() {
				return this._localFSEntry.toURL();
			},
			
			
			/**
			 * Return name of file
			 * @public
			 * @name File#getName
			 * @function
			 * @return {String} name of file
			 */
			getName: function() {
				return this._name;
			},
			
			
			/**
			 * Display file in DOM as a checkbox
			 * @public
			 * @name File#addToResults
			 * @function
			 * @param {DOMElement} parent parent DOM element
			 * @return {DOMElement} new checkbox DOM element
			 */
			addToResults: function(parent) {
				var el = $("<input type='checkbox'>"
						+ this._name + "</input><br>");
				// manage select/unselect
				var self = this;
				el.change(function(e) {
					if (el.attr('checked'))
						self._select(self._listJElement);
					else
						self._unselect(self._listJElement);
				});
				el.appendTo(parent);
				return this._listJElement = el.first();
			},
			
			
			/**
			 * Display file as a draggable link to local file
			 * @public
			 * @name File#displayAsLink
			 * @function
			 * @param {DOMElement} parent parent DOM element
			 * @return {DOMElement} new link DOM element
			 */
			displayAsLink: function(parent) {
				this._localJElement = $("<input type='checkbox'></input><a href='"+this.getLocalURL()+"'"
						+ " class='dragout' draggable='true'"
						+ ' data-downloadurl="application/octet-stream:'+escape(this._name)+':'+this.getLocalURL()+'">'
						+ this._name + "</a><br>");
				// manage select/unselect
				var cbox = this._localJElement.first();
				var self = this;
				cbox.change(function(e) {
					if (cbox.attr('checked'))
						self._select(cbox);
					else
						self._unselect(cbox);
				});
				// manage click
				var a = this._localJElement.eq(1);
				a.unbind("click").click(function() {
					console.log('opening: '+self.getName()+'...');
					window.open(self.getLocalURL(), self.getName());
					return false;
				});
				// manage drag out
				a[0].addEventListener('dragstart', function(evt) {
					evt.dataTransfer.setData('DownloadURL', this.getAttribute('data-downloadurl'));
					console.log('dragging: '+this._name+'...');
				}, false);
				this._localJElement.appendTo(parent);
				return this;
			},
			
			
			/**
			 * Remove local file and link
			 * @public
			 * @name File#removeLink
			 * @function
			 */
			removeLink: function() {
				// remove from list
				this._localJElement.remove();
				// remove from local store
				var self = this;
				this._localFSEntry.remove(function() {
					console.log('file '+self._localFSEntry.name+' removed');
				}, function(e) {
					console.log('error removing '+self._localFSEntry.name+': '+LocalStorage.getFileErrorMsg(e));
				});
				return this;
			},
			
			
			/**
			 * Display file with its download status
			 * @public
			 * @name File#displayAsDownloading
			 * @function
			 * @param {DOMElement} parent parent DOM element
			 * @return {Function} progress info update function
			 */
			displayAsDownloading: function(parent) {
				this._statusJElement = $("<input type='checkbox'></input><a>"+this._name+"   </a><a></a><br>");
				// checkbox is invisible, only for left alignment
				this._statusJElement.first().css('visibility', 'hidden');
				this._statusJElement.appendTo(parent);
				// return status update function
				var self = this;
				return function(status) {
					self._statusJElement.eq(2).html(status);
				};
			},	
			
			
			/**
			 * Remove downloading file
			 * @public
			 * @name File#removeDownloading
			 * @function
			 */
			removeDownloading: function() {
				// remove from list
				this._statusJElement.remove();
				return this;
			},
			
			
			/**
			 * Start download of file
			 * @public
			 * @name File#download
			 * @function
			 * @param {Function} end callback for end of download
			 * @param {Function} update callback to update download status
			 * @return {File} self
			 */
			download: function(end, update) {
				var req = new XMLHttpRequest();
				req.open('GET', this._uri.toString(), true);
				// FIXME: selecting type 'blob' triggers 'onload' with response=null 
				req.responseType = 'arraybuffer';
				req.onprogress = function(event) {
					var text = '';
					switch (req.readyState) {
					case 1: 
						text = 'Open...';
						break;
					case 2:
						text = 'Sent...';
						break;
					case 3:
						text = (new Number(100*event.loaded/event.total)).toFixed(0)+'%';
						break;
					case 4:
						text = 'Loaded ('+event.loaded+'B)';
						break;
					default:
						break;
					}
					if (update)
						update(text);
					if (req.status != 200) 
						throw 'file download failed for '+this._uri.toString();
				};
				req.onload = function() {
					if ((this.status === 200) && end) {
						var bb = new Blob([this.response], 
										  {type:'application/octet-stream'});
					    end(bb);
					}
				};
				console.log('downloading: '+this._uri.toString()+'...');
				req.send();
				return this;
			},
			
			
			/**
			 * Download and save file to a given filesystem
			 * @public
			 * @name File#saveToFile
			 * @function
			 * @param {FileSystem} fs target filesystem
			 * @param {Function} cb callback for end of write
			 * @return {File} self
			 */
			saveToFile: function(fs, cb) {
				var self = this;
				LocalStorage.createFile(
						fs,
						this._name,
						function(entry) {
							self._localFSEntry = entry;
							self.download(
									function(data) {
										console.log('downloaded '+data.size+'B');
										self._unselect(self._listJElement);
										LocalStorage.writeToFile(
												entry,
												data,
												function(res) {
													if (cb)
														cb(res, self);
												});		
									},
									// display as downloading and get update function
									self.displayAsDownloading($(Constants.Selectors.DOWNLOADING_LIST)[0])
							);
						}
				);
				return this;
			},
			
			
			/**
			 * Read content of local file if available
			 * @public
			 * @name File#readFile
			 * @function
			 * @param {Function} cb callback for end of reading
			 * @return {File} self
			 */
			readFile: function(cb) {
				if (!this._localFSEntry)
					if (cb)
						cb(false);
				var self = this;
				this._localFSEntry.file(function(file) {
					var reader = new FileReader();
					reader.onloadend = function(e) {
						if (cb)
							cb(true, e.target.result);
					};
					reader.onerror = function(error) {
						console.log('failed to open file '+self._localFSEntry.name+': '
									+LocalStorage.getFileErrorMsg(error));
						if (cb)
							cb(false);
					};
					console.log('opening file '+self._localFSEntry.name+'...');
					reader.readAsBinaryString(file);
				});
				return this;					
			}
	};
	
	
	/**
	 * Create element of the correct type for a given URL
	 * @public
	 * @name create
	 * @function
	 * @memberOf Elements
	 * @param {String} url url of element
	 * @param {String} name name of element
	 * @param {Query} query exploration filter
	 * @return {Element} new element
	 */
	exports.create = function(url, name, query) {
		if (url[url.length-1] === '/') {
			// create dir 
			return createDir(url, name, query);
		}
		else {
			// create file
			return createFile(url, name);
		}
	};
	exports.createFile = createFile;
	exports.createDirectory = createDir;
	
	return exports;
	
})(); // end of Elements

exports.Elements = Elements;




/**
 * 
 * Search operations
 * @namespace
 * @name Search
 * @memberOf GFS
 * 
 */
var Search = (function() {

	var exports = {};

	
	// extensions
	// TODO add extensions
	var extensions = [
        ['wma', 'mp3', 'ogg', 'm4a', 'm4p', 'flac', 'alac'],
        ['avi', 'mp4', 'mov', 'mpg', 'mkv'],
	    ['pdf', 'doc', 'xls', 'ppt', 'pps', 'docx', 'xlsx', 'pptx', 'ppsx', 'odt', 'ods', 'odp'],
		['gp3', 'gp4', 'gp5', 'gpx', 'gtp', 'ptb', 'tef', 'ly']
	];
	var _extIndex = 0;
//	var _extstr = "";
	
	
	/**
	 * Init the drop-down list of file extensions
	 * @public
	 * @name Search#initExtensionsList
	 * @function
	 * @memberOf Search
	 */
	exports.initExtensionsList = function() {
		
		// fill extensions list
		var el = $(Constants.Selectors.EXTENSIONS_LIST);
		el.html("");
		var i, exts, opt, extstr;
		for (i=0; i<extensions.length; ++i) {
			exts = extensions[i];
			extstr = (exts.length > 3) ?
				  exts.slice(0,3).join(', ')+'...'
				: exts.join(', ');
			opt = $("<option value="+i+">"+extstr+"</option>");
			opt.appendTo(el);
		}
		el.change(function() {
			_extIndex = el.val();
//			_extstr = extensions[_extIndex].join('|');
			console.log('selected extensions '+extensions[_extIndex]);
		}).change();
	};

	
	/** 
	 * Blacklisted hosts
	 * @private
	 * @name Search#_blacklist
	 * @memberOf Search
	 */
	var _blacklist = [ 'mp3mirror.com'
	                 , 'vmp3.eu'
	                 , 'mp3toss.com'
	                 , 'listen77.com'
	                 , 'mmusicz.com'
	                 , 'openwebindex.com'
	                 , 'kbjinteractive.com'
	                 , 'dogpile.com'
	                 , 'godsinamnesia.com'
	                 , 'hotpixels.eu'
	                 , 'findallmp3.com'
	                 , 'mp3blogs.com'
	                 , 'writeups.info'
	                 , 'registryquick.net'
	                 , 'doxic.com'
	                 , 'lokys.net'
	                 // following hosts are password-protected sites
	                 , 'wallywashis.name'
	                 , 'pipl.com'
	];
	var _blstr = _blacklist.length ?
			  ' -site:' + _blacklist.join(' -site:')
			: '';
			  
			  
	// results set
	var _resultsSize = 8;
	var _totalHosts = 0;
	var RESULTS_SIZE_STEP = 8;
	var _page = 0;
	
	
	/**
	 * Increase size of search results list
	 * @public
	 * @name Search#incResultsSize
	 * @function
	 * @memberOf Search
	 */
	exports.incResultsSize = function() {
		_resultsSize += RESULTS_SIZE_STEP;
		$(Constants.Selectors.MAX_RESULTS).val(_resultsSize);
	};
	
	
	/**
	 * Decrease size of search results list
	 * @public
	 * @name Search#decResultsSize
	 * @function
	 * @memberOf Search
	 */
	exports.decResultsSize = function() {
		if (_resultsSize > RESULTS_SIZE_STEP)
			_resultsSize -= RESULTS_SIZE_STEP;
		$(Constants.Selectors.MAX_RESULTS).val(_resultsSize);
	};
	
	
	/**
	 * Number of results from the last query
	 * @private
	 * @name Search#_resultsCount
	 * @function
	 * @memberOf Search
	 */
	var _resultsCount = (function(){
		
		var _resultsNum = 0;
		return {
			set: function(n) {
				_resultsNum = n;
				$(Constants.Selectors.RESULTS_COUNT).text('Results: '+_resultsNum);
				return _resultsNum;
			},
			get: function() {
				return _resultsNum;
			},
		};
	})();
	
	
	/**
	 * Populates google search results list
	 * @private
	 * @name Search#onSearchComplete
	 * @function
	 * @memberOf Search
	 */
	function onSearchComplete(sc, searcher)  {
		
		if (   !searcher.results 
			|| !searcher.results.length	)
			return;
		
		_resultsCount.set(_resultsCount.get() + searcher.results.length);
		searcher.results.forEach(function(res) {
			var dir = Elements.createDirectory(
					res.unescapedUrl, 
					res.title, 
					_query);
			dir.addToResults($(Constants.Selectors.RESULTS_LIST)[0]);
		});
		
		_totalHosts += searcher.results.length;
		if(_totalHosts < _resultsSize) {
			_page++;
			searcher.gotoPage(_page);
		}
	}
	
	
	/**
	 * Process google search results and display relevant ones
	 * @private
	 * @name Search#onAutoSearchComplete
	 * @function
	 * @memberOf Search
	 */
	function onAutoSearchComplete(sc, searcher)  {
		
		if (   !searcher.results 
			|| !searcher.results.length	)
			return;
		
		searcher.results.forEach(function(res) {
			var dir = Elements.createDirectory(
					res.unescapedUrl, 
					res.title,
					_query);
			console.log('searching in '+dir.getURL());
			dir.getElements(function(els) {
				if (els && els.length) {
					console.log(els.length + ' elements in ' + dir.getURL());
					dir.addToResults($(Constants.Selectors.RESULTS_LIST)[0]);
					dir.open();
					_resultsCount.set(_resultsCount.get() + els.length);
				}
				else {
					console.log('nothing found in ' + dir.getURL());
				}
			});
		});
		
		_totalHosts += searcher.results.length;
		if(_totalHosts < _resultsSize) {
			_page++;
			searcher.gotoPage(_page);
		}
	}
	
	
	/**
	 * Create a query object
	 * @private
	 * @name Search#createQuery
	 * @function
	 * @memberOf Search
	 * @param {String} text query text
	 * @param {Array} exts array of looked for extensions
	 * @returns {Search.Query} new query object
	 */
	function createQuery(text, exts) {
		var _crit = text.toLowerCase().split(' ');
		function _match(str) {
			var res = true;
			// every element of the _crit array must be part of the string
			_crit.forEach(function(qs) {
				if (str.toLowerCase().indexOf(qs) === -1)
					res = false;
			});
			return res;
		}
		
		/**
		 * Query
		 * @name Query
		 * @memberOf Search
		 */
		return {
			
			toString: function() {
				return _crit.join(',');
			},
			
			/**
			 * Test if URI matches query
			 * @public
			 * @name Query#matchUri
			 * @function
			 * @memberOf Query
			 * @param {URI} uri
			 * @return {Boolean}
			 */
			matchUri: function(uri) {
				return _match(escape(uri.toString()));
			},
			
			/**
			 * Test if URI is not blacklisted
			 * @public
			 * @name Query#isValid
			 * @function
			 * @memberOf Query
			 * @param {URI} uri
			 * @return {Boolean}
			 */
			isValid: function(uri) {
				return _blacklist.indexOf(uri.domain(true)) === -1;
			},
			
			/**
			 * Test if name of file matches query
			 * @public
			 * @name Query#matchName
			 * @function
			 * @memberOf Query
			 * @param {String} name
			 * @return {Boolean}
			 */
			matchName: function(str) {
				return _match(str);
			},
			
			
			/**
			 * Test if name of file matches query extensions
			 * @public
			 * @name Query#matchExt
			 * @function
			 * @memberOf Query
			 * @param {String} name
			 * @return {Boolean}
			 */
			matchExt: function(str) {
				var pt = str.lastIndexOf('.');
				if (pt === -1)
					return false;
				return $.inArray(str.slice(pt+1), exts) !== -1;
			},
			
			/**
			 * Start a search with Google
			 * @public
			 * @name Query#executeWithGoogle
			 * @function
			 * @memberOf Query
			 * @param onComplete processor for search results
			 */
			executeWithGoogle: function(onComplete) {

				var searchControl = new google.search.CustomSearchControl(Constants.Search.CSE_ID);
				// Create a search control
//				var searchControl = new google.search.SearchControl();
				// Add in a full set of searchers
				searchControl.addSearcher(new google.search.WebSearch());
				searchControl.setResultSetSize(google.search.Search.LARGE_RESULTSET);
				
				// tell the searcher to draw itself and tell it where to attach
				// the following line is mandatory
				searchControl.draw('searchcontrol');
				searchControl.setSearchCompleteCallback(this, onComplete);
				//  searchControl.setNoHtmlGeneration();
				//  searchControl.setSearchStartingCallback(this, OnSearchStarting);
				
				//!! dont use 'size' in request or no answer ...
				var request = "-inurl:(htm|html|php) +\"index of\" +\"last modified\" +\"parent directory\" +description "
					+ ' +(' + exts.join('|') + ')' + ' +\"' + text + '\"'
					+ ' ' + _blstr;
				console.log('send request ' + request);
				_page = 0;
				searchControl.execute(request);
			}
		};
	}
	
	// current search query
	var _query;
	
	/**
	 * Start a search
	 * @public
	 * @name Search#start
	 * @function
	 * @memberOf Search
	 * @param auto true if autosearch required
	 */
	exports.start = function(auto) {
		_query = createQuery($(Constants.Selectors.QUERY_TEXT).val(), extensions[_extIndex]);
		_query.executeWithGoogle(auto ? onAutoSearchComplete : onSearchComplete);
	};
	

	/**
	 * Clear the query field
	 * @public
	 * @name Search#clearQuery
	 * @function
	 * @memberOf Search
	 */
	exports.clearQuery = function() {
		$(Constants.Selectors.QUERY_TEXT).val('');
	};

	
	/**
	 * Clear the results list
	 * @public
	 * @name Search#clear
	 * @function
	 * @memberOf Search
	 */
	exports.clear = function() {
		console.log('clearing '+$(Constants.Selectors.RESULTS_LIST+' > a').length+' elements');
		$(Constants.Selectors.RESULTS_LIST).empty();
		_resultsCount.set(0);
		_totalHosts = 0;
	};
	
	return exports;
	
})(); // end of Search

exports.Search = Search;




/**
 * 
 * Operations on downloaded files
 * @namespace
 * @name Download
 * @public
 * @memberOf GFS
 * 
 */
var Download = (function() {
	
	var exports = {};
	
	
	// number of concurrent downloading files
	var _maxDownloads = 3;
	
	/**
	 * Increase the number of simultaneous downloads
	 * @public
	 * @name Download#incMaxDownload
	 * @function
	 * @memberOf Download
	 */
	exports.incMaxDownload = function() {
		_maxDownloads++;
		$(Constants.Selectors.MAX_DOWNLOADS).val(_maxDownloads);
		
	};
	

	/**
	 * Decrease the number of simultaneous downloads
	 * @public
	 * @name Download#decMaxDownload
	 * @function
	 * @memberOf Download
	 */
	exports.decMaxDownload = function() {
		if (_maxDownloads > 1)
			_maxDownloads--;
		$(Constants.Selectors.MAX_DOWNLOADS).val(_maxDownloads);
	};
	
	
	/** 
	 * Returns selected elements in a list
	 * @private
	 * @name Download#_getSelectedElements
	 * @function
	 * @memberOf Download
	 * @param {jQuery} list jQuery element for the target list
	 * @return {Array} array of selected elements
	 */
	function _getSelectedElements(list) {
		return list.find("input:checked").map(function(i, el) {
			return $(el).data('myObject');
		}).get();
	}
	

	var _done = 0;	
	function _downloadNext(fs, files, idx, step) {
		if (_done === files.length)
			return;
		var file = files[idx];
		if (!file)
			return;
		file.saveToFile(fs, function(res, f) {
			// end of file write
			if (res) {
				// success
				f.displayAsLink($(Constants.Selectors.DOWNLOADING_LIST)[0]);
				f.removeDownloading();
				_done++;
				_downloadNext(fs, files, idx+step, step);
			}
			else {
				// download failed
				_done++;
				_downloadNext(fs, files, idx+step, step);
			}
		});
	};
	
	
	/**
	 * Start download of selected files
	 * @public
	 * @name Download#start
	 * @function
	 * @memberOf Download
	 */
	exports.start = function() {
		
		// get storage directory
		LocalStorage.getFileSystem(function(fs) {
			// download each file
			var files = _getSelectedElements($(Constants.Selectors.RESULTS_LIST));
			var i;
			console.log("downloading "+ files.length +" files...");
			_done = 0;
			if (fs) {
				for (i=0; i<_maxDownloads && i<files.length; i++)
					_downloadNext(fs, files, i, _maxDownloads);
			}
			else {
				// no local storage: open selected files one by one with browser
				for (i=0; i<files.length; i++)
					window.open(files[i].getURL());
			}
		});
	};
	
	
	/**
	 * Open selected files one by one with browser
	 * @public
	 * @name Download#startNoFS
	 * @function
	 * @memberOf Download
	 */
	exports.startNoFS = function() {
		
		// get storage directory
		LocalStorage.getFileSystem(function(fs) {
			// download each file
			var files = _getSelectedElements($(Constants.Selectors.RESULTS_LIST));
			console.log("downloading "+ files.length +" files...");
			_done = 0;
			for (var i=0; i<_maxDownloads && i<files.length; i++)
				_downloadNext(fs, files, i, _maxDownloads);
		});
	};
	

	/**
	 * Select all downloaded files
	 * @private
	 * @name Download#select_all_download
	 * @function
	 * @memberOf Download
	 */
	function select_all_download() {
		var cbs = $(Constants.Selectors.DOWNLOADING_LIST).find("input[type='checkbox']");
		if (!cbs.size())
			return;
		cbs.attr('checked', true).change();
		$('input[type="button"][name="selectDlButton"]')
			.unbind("click").click(unselect_all_download)
			.val('unselect all');
	}
	exports.selectAll = select_all_download;
	

	/**
	 * Unselect all downloaded files
	 * @private
	 * @name Download#unselect_all_download
	 * @function
	 * @memberOf Download
	 */
	function unselect_all_download() {
		$(Constants.Selectors.DOWNLOADING_LIST).find("input[type='checkbox']")
			.attr('checked', false).change();
		$('input[type="button"][name="selectDlButton"]')
			.unbind("click").click(select_all_download)
			.val('select all');
	}
	
	
	/**
	 * Removes selected files
	 * @public
	 * @name Download#clear
	 * @function
	 * @memberOf Download
	 */
	exports.clear = function() {
		// remove selected files
		var files = $(Constants.Selectors.DOWNLOADING_LIST+' input:checked');
		console.log("removing "+ files.size() +" files...");
		files.each(function(i, el) {
			$(el).data('myObject').removeLink();
		});
		unselect_all_download();
	};
	
	
	/**
	 * Disable the download functionalities
	 * @public
	 * @name Download#disable
	 * @function
	 * @memberOf Download
	 * @param {String} msg cause for disabling
	 */
	exports.disable = function(msg) {
		$(Constants.Selectors.DOWNLOADER_FORM)
			.html('<img width=16 height=16 src="'+Constants.Images.WARNING+'"></img>'
					+ '<i style="padding-left: 1em;font-size:12px">'+msg+'</i>');
	};
	
	
	/**
	 * Make a zip file out of selected files
	 * @public
	 * @name Download#zip
	 * @function
	 * @memberOf Download
	 */
	exports.zip = function() {
		var els = _getSelectedElements($(Constants.Selectors.DOWNLOADING_LIST));
		if (!els.length)
			return;
		var zip = new JSZip();
		var done = 0;
		console.log(els.length+' elements selected');
		// disable dl actions
		var buttons = $(Constants.Selectors.DOWNLOAD_BUTTONS);
		buttons.attr('disabled',true);
		var zipb = buttons.filter('input[name=zipDlButton]');
		zipb.val('archiving...');

		// archive all elements
		els.forEach(function(el) {
			// read content
			el.readFile(function(res, content) {
				console.log('file '+el.getName()+' length='+content.length);
				++done;
				if (!res) {
					// read failed
					return;
				}
				// success
				zip.file(
						  el.getName()
						, content
						, {base64: false, binary: true}
				);
				// free buffer
				content = null;
				if (done === els.length) {
					// zip is complete
					LocalStorage.getFileSystem(function(fs) {
						LocalStorage.createFile(
								fs,
								'archive.zip',
								function(entry) {
									// get zip binary content
									var zipdata = zip.generate({base64: false});
									console.log('zip len='+zipdata.length);
									// transform binary string to ArrayBuffer
									// cf http://stackoverflow.com/questions/7760700/html5-binary-file-writing-w-base64
									var ab = new ArrayBuffer(zipdata.length);
									var ia = new Uint8Array(ab);
									for (var i = 0; i < zipdata.length; i++) {
										ia[i] = zipdata.charCodeAt(i);
									}
									// Create a new Blob and write it
									var bb = new Blob([ab], 
													  {type:'application/octet-stream'});
									LocalStorage.writeToFile(
											entry,
											bb,
											function(res) {
												// free buffer
												zipdata = null;
												ab = null;
												// reenable dl buttons
												buttons.attr('disabled',false);
												zipb.val('zip');
												if (res) {
													// dl zip
													window.open(entry.toURL());
												}
									});
								}
						);
					});
				}
			});
		});
	};
	
	return exports;
	
})(); // end of Download

exports.Download = Download;



exports.LocalStorage = LocalStorage;


return exports;

})(); // end of GFS




/**
 * Program entry point: executed when the DOM is fully loaded
 * @public
 * @name $(handler)
 * @function
 */
$(function() {

	// various UI inits
	$('input[type="button"][name="selectDlButton"]').click(GFS.Download.selectAll);
	GFS.Search.initExtensionsList();

	// init input events
	$('input[type="button"][name="clearButton"]').click(GFS.Search.clearQuery);
	$('input[type="button"][name="searchButton"]').click(function() { GFS.Search.start.apply(false) });
	$('input[type="button"][name="autoSearchButton"]').click(function() { GFS.Search.start.apply(true) });
	$('input[type="button"][name="decResults"]').click(GFS.Search.decResultsSize);
	$('input[type="button"][name="incResults"]').click(GFS.Search.incResultsSize);
	$('input[type="button"][name="dlButton"]').click(GFS.Download.start);
	$('input[type="button"][name="clearDlButton"]').click(GFS.Search.clear);
	$('input[type="button"][name="decMaxDownload"]').click(GFS.Download.decMaxDownload);
	$('input[type="button"][name="incMaxDownload"]').click(GFS.Download.incMaxDownload);
	$('input[type="button"][name="zipDlButton"]').click(GFS.Download.zip);
	$('input[type="button"][name="clearDlButton"]').click(GFS.Download.clear);
	
	// restore list of local files
	GFS.LocalStorage.getAllFiles(function(entries) {
		if (!entries) {
			console.log('local store not available!');
			// fallback download mode
			GFS.Download.disable('Some download functionalities are not available for this browser, try Chrome version instead.');
		}
		else {
			console.log(entries.length+' files in local store');
			for (var i=0; i<entries.length; ++i) {
				var f = GFS.Elements.createFile(entries[i].fullPath, entries[i]);
				f.displayAsLink($(GFS.Constants.Selectors.DOWNLOADING_LIST)[0]);
			}
		}
	});
});
