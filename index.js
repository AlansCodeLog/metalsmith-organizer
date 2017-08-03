const moment = require('moment');

module.exports = plugin;

function plugin (opts) {
  // SORT OPTIONS

  // all our exempted properties
  const exceptions = ['groupName', 'path', 'override_permalinkGroup', 'page_layout', 'date_page_layout', 'expose', 'date_format', 'perPage', 'page_description', 'num_format', 'reverse', 'no_folder', 'searchType', 'add_prop', 'change_extension', 'page_only'];

  // default option values
  if (typeof opts.drafts === 'undefined') {
    opts.drafts = false;
  }
  opts.search_type = opts.search_type || 'all';

  // set search criteria for each group
  for (let groupIndex in opts.groups) {
    opts.groups[groupIndex].search = Object.keys(opts.groups[groupIndex]).map(criteria => {
      if (!exceptions.includes(criteria)) { // add new non-search options here
        const obj = {};
        obj[criteria] = opts.groups[groupIndex][criteria];
        return obj;
      }
    }).filter(property => { return typeof property !== 'undefined'; });
  }

  /**
   * the default make_safe function for titles, does not apply to slugs (on purpose)
   *
   * @param {String} string
   * @returns {String}
   */
  function _defaultMakeSafe (string) {
    return string.replace(/(-|\/)/g, '').replace(/('|"|\(|\)|\[|\]|\?|\+)/g, '').replace(/(\s)+/g, '-').toLowerCase();
  }
  // let user override
  const makeSafe = (typeof opts.make_safe === 'function') ? opts.make_safe : _defaultMakeSafe;

  /**
   * Returns the groups index based on group_name
   *
   * @param {String} group_name the name of the group
   * @returns {Number}
   */
  function _getGroupIndex (group_name) { // eslint-disable-line camelcase
    for (let groupIndex = 0; groupIndex < opts.groups.length; groupIndex++) {
      if (opts.groups[groupIndex].group_name === group_name) { // eslint-disable-line camelcase
        return groupIndex;
      }
    }
    return false;
  }

  /**
   * Assign date data to metalsmith_.metadata
   *
   * @param {any} obj
   * @param {any} path
   * @param {any} value
   */
  function _assignPath (obj, path, value) {
    const last = path.length - 1;
    for (let i = 0; i < last; i++) {
      const key = path[i];
      if (typeof obj[key] === 'undefined') {
        obj[key] = {};
      }
      obj = obj[key];
    }
    obj[path[last]] = value;
  }

  /**
   * sort function for group dates
   * FIXME groupIndex WTF
   *
   * @param {any} a
   * @param {any} b
   * @returns
   */
  function _order (a, b) {
    if (typeof opts.groups[groupIndex].reverse !== 'undefined' && opts.groups[groupIndex].reverse === false) {
      return a.date - b.date;
    } else {
      return b.date - a.date;
    }
  }

  // PLUGIN
  return function (files, metalsmith, done) {
    // empty group array to push results to
    const groups = [];

    (function init () {
      // groupIndex being currently parsed, so functions can actually have some context
      let groupIndex = null;

      // parse all files passed to the plugin, filter and sort them
      for (let fileIndex in files) {
        let post = files[fileIndex];
        for (groupIndex in opts.groups) {
          // if draft check
          if (opts.drafts === false &&
            (post.draft === true || post.draft === 'true' || post.published === false || post.published === 'false' || post.status === 'draft')) {
            continue;
          }
          // see if post specifies search_type
          let searchType = typeof opts.groups[groupIndex].search_type !== 'undefined' ? opts.groups[groupIndex].search_type : opts.search_type;
          // check if post matches criteria then send the post to sort if it does
          if (matchPost(post, searchType, opts.groups[groupIndex].search)) {
            groups[groupIndex] = sortPost(post, fileIndex, opts.groups[groupIndex]);
          }
        }
      }

      // once we have out new `groups` object sort it by date if necessary
      for (groupIndex in groups) {
        let expose = opts.groups[groupIndex].expose;
        if (expose) {
          // FIXME variable shadowing, shouldn't happening
          // FIXME also, what the hell is going on here, not everything is an expose!?!?! variable naming FTW! LOL JK!
          for (expose in groups[groupIndex]) {
            // FIXME there might not be files available
            groups[groupIndex][expose].files = groups[groupIndex][expose].files.sort(_order);
          }
        } else {
          // console.log(typeof groups[groups].files == "undefined")
          if (typeof groups[groupIndex].files !== 'undefined') { // don't overwrite exposed groups
            groups[groupIndex].files = groups[groupIndex].files.sort(_order);
          }
        }
      }

      // delete original file list
      for (let file in files) {
        delete files[file];
      }

      // with our new groups array go through them and push our final files to our files list
      for (let groupIndex in groups) {
        let expose = opts.groups[groupIndex].expose;
        let exposeValue = opts.groups[groupIndex][expose];
        let pathReplace = {group: opts.groups[groupIndex].group_name};
        let groupName = opts.groups[groupIndex].groupName;
        let layout = opts.groups[groupIndex].page_layout || 'index';
        let extension = typeof opts.groups[groupIndex].change_extension !== 'undefined' ? opts.groups[groupIndex].change_extension : '.html';
        pageParser(files, groupIndex, groupName, exposeValue, expose, pathReplace, layout, extension);
        postParser(files, groupIndex, groupName, exposeValue, expose, pathReplace, layout, extension);
      }
    })();

    /**
     * returns whether a post matches our criteria or not
     *
     * @param {Object} data the data associated to a parsed file
     * @param {String} searchType can either be `all` or `any`
     * @param {Array} searchParams the specified params used for matching
     * @returns {Boolean}
     */
    function matchPost (data, searchType, searchParams) {
      let match = false;
      // we include all posts by default if no search has been defined in the options
      if (searchParams.length === 0) {
        return true;
      }
      for (let propIndex = 0; propIndex < searchParams.length; propIndex++) {
        let propertyName = Object.keys(searchParams[propIndex]);
        let propertyValue = searchParams[propIndex][propertyName];

        // first one wrong will return false
        if (searchType === 'all') {
          match = true;
          if (!contains(data[propertyName], propertyValue)) {
            match = false;
            break;
          }
        // first one correct will return true
        } else if (searchType === 'any') {
          if (contains(data[propertyName], propertyValue)) {
            match = true;
            break;
          }
        }
      }
      return match;
    }

    /**
     * checks individual values of post and returns whether there's a match to the match function
     *
     * @param {any} data
     * @param {any} propertyValue
     * @returns
     */
    function contains (data, propertyValue) {
      // for when we just want to check if a property exists
      if (typeof propertyValue === 'boolean') {
        if (propertyValue === true && typeof data !== 'undefined') {
          return true;
        } else if (propertyValue === true && typeof data === 'undefined') {
          return false;
        } else if (propertyValue === false && typeof data === 'undefined') {
          return true;
        } else if (propertyValue === false && typeof data !== 'undefined') {
          return false;
        }
      }
      // for checking strings and arrays against our search criteria values
      if (typeof data !== 'undefined') {
        if (typeof data === 'string' && makeSafe(data) === makeSafe(propertyValue)) {
          return true;
        }
        if (Array.isArray(data)) {
          data = data.map(tag => {
            tag = makeSafe(String(tag).trim());
            return tag;
          });
          return data.includes(makeSafe(propertyValue));
        }
      }
    }

    /**
     * sort the post/file into the right group.
     * `expose` will influence the sorting and shoud be used in a group like:
     * ```
     * {
     *    expose: 'tags',
     *    tags: [ 'alpha', 'beta', 'gamma' ]
     * }
     * ```
     *
     * @param {Object} post the actual object containing all properties of the post
     * @param {Number|String} fileName the current file being parsed
     * @param {Array} optsGroup the current groups in the options passed to Metalsmith
     * @return {Array}
     */
    function sortPost (post, fileName, optsGroup) {
      const expose = optsGroup.expose;
      const exposeValue = optsGroup[expose];

      if (typeof post.title === 'undefined') {
        throw new Error('File ' + fileName + ' missing title. If the file has a title, make sure the frontmatter is formatted correctly.');
      }

      if (expose) {
        if (typeof exposeValue === 'undefined') { // e.g. expose:tags but no specific tag defined, it'll expose all
          for (let property in post[expose]) { // no need to get list of tags, for each tag in post it's "pushed" to its tags
            return createGroup(optsGroup, post, post[expose][property]);
          }
        } else {
          return createGroup(optsGroup, post, exposeValue); // e.g. expose: tags, tags: post
        }
      } else {
        return createGroup(optsGroup, post); // don't expose anything
      }
    }

    /**
     * create the brand new group populated with all the good intentions
     *
     * @param {Object} optsGroup current group being acted upon
     * @param {any} post the ready-available data related to the post
     * @param {String|Array|Boolean} expose the exposed variable for the post
     * @return {Array}
     */
    function createGroup (optsGroup, post, expose) {
      // post prepare
      const groupName = optsGroup.group_name;
      post.original_contents = new Buffer(post.contents.toString());
      // sort out the path for the post
      let pathReplace = {};
      if (typeof post.slug !== 'undefined') {
        pathReplace.title = post.slug; // do not makeSafe the slug on purpose
      } else {
        pathReplace.title = makeSafe(post.title);
      }
      // normal groups
      // because the object is just being referenced, it might have already been set
      if (typeof post.permalink === 'undefined') {
        const permalinkGroupIndex = _getGroupIndex(opts.permalink_group);
        pathReplace.group = groupName;
        if (typeof opts.groups[ permalinkGroupIndex ].date_format !== 'undefined') {
          pathReplace.date = moment(post.date).format(opts.groups[ permalinkGroupIndex ].date_format);
        }
        post.permalink = '/' + opts.groups[permalinkGroupIndex].path
          .replace(/\/{num}/g, '')
          .replace(/{(.*?)}/g, function (matchPost, matchedGroup) {
            return pathReplace[matchedGroup];
          });
      }
      // groups that override the permalink
      if (typeof optsGroup.override_permalink_group !== 'undefined') {
        let path;
        pathReplace.group = groupName;
        if (typeof optsGroup.override_permalink_group.date_format !== 'undefined') {
          pathReplace.date = moment(post.date).format(optsGroup.override_permalink_group.date_format);
        }
        if (typeof optsGroup.path === 'undefined') {
          path = '{group}/{title}';
        } else {
          path = optsGroup.path;
        }
        post.permalink = '/' + path.replace(/\/{num}/g, '').replace(/{(.*?)}/g, function (matchPost, matchedGroup) {
          return pathReplace[matchedGroup];
        });
      }
      // add any properties specified
      if (typeof optsGroup.add_prop !== 'undefined') {
        for (let set in optsGroup.add_prop) {
          const prop = Object.keys(optsGroup.add_prop[set])[0];
          post[prop] = optsGroup.add_prop[set][prop];
        }
      }
      // end of post prepare

      // actually push to group
      const group = {};
      if (expose) {
        group[expose] = group[expose] || {};
        group[expose].files = group[expose].files || [];
        group[expose].files.push(post);
      } else {
        if (typeof opts.groups.date_format !== 'undefined') {
          let dateItems = opts.groups.date_format;
          dateItems = dateItems.split('/');
          for (let i = 1; i <= dateItems.length; i++) {
            let format = dateItems.slice(0, i).join('/');
            let dategroup = moment(post.date).format(format);
            group.dates = group.dates || {};
            group.dates[dategroup] = group.dates[dategroup] || {};
            group.dates[dategroup].files = group.dates[dategroup].files || [];
            group.dates[dategroup].files.push(post);
          }
        }
        group.files = group.files || [];
        group.files.push(post);
      }

      return group;
    }

    /**
     * for pages
     *
     * @param {any} files
     * @param {any} groupIndex
     * @param {any} groupName
     * @param {any} exposeValue
     * @param {any} expose
     * @param {any} pathReplace
     * @param {any} layout
     * @param {any} extension
     * @returns
     */
    function pageParser (files, groupIndex, groupName, exposeValue, expose, pathReplace, layout, extension) {
      // return when path does not allow page to be made or when we're in the permalink group
      if (opts.groups[groupIndex].path === '{title}' ||
        (groupName === opts.permalink_group && opts.groups[groupIndex].override_permalink_group === false)) {
        return;
      }
      // set largegroup to more clearly understand what's being iterated over
      let largegroup = groups[groupIndex];
      if (typeof largegroup.dates !== 'undefined') {
        largegroup = largegroup.dates;
      }
      // FIXME this should be refactored in smaller chunks, hard to digest all at once
      for (let minigroup in largegroup) {
        let pageFiles;
        // determines where exactly the files are
        if (typeof largegroup[exposeValue] !== 'undefined') { // exposed value
          pageFiles = largegroup[exposeValue].files;
        } else if (typeof largegroup[minigroup] !== 'undefined' && minigroup !== 'files') { // dates
          pageFiles = largegroup[minigroup].files;
        } else { // normal pages
          pageFiles = largegroup.files;
        }
        // push any exposed information to metalsmith._metadata and handle path for dates layout
        if (typeof expose !== 'undefined' && typeof exposeValue === 'undefined') { // exposed values
          metalsmith._metadata.site[expose] = metalsmith._metadata.site[expose] || {};
          let nicename = makeSafe(minigroup);
          let count = pageFiles.length;
          metalsmith._metadata.site[expose][minigroup] = {nicename: nicename, count: count};
        } else if (typeof expose === 'undefined' && minigroup !== 'files') { // dates
          // metadata
          if (moment(minigroup, opts.groups[groupIndex].date_format, true).isValid()) {
            metalsmith._metadata.site.dates = metalsmith._metadata.site.dates || {};
            let dateItems = minigroup;
            let count = pageFiles.length;
            dateItems = dateItems.split('/');
            _assignPath(metalsmith._metadata.site.dates, dateItems, {date: minigroup, count: count, files: pageFiles});
          }
          // layout
          const dateLayout = opts.groups[groupIndex].date_page_layout.split('/');
          const currentLayout = minigroup.split('/').length - 1;
          layout = dateLayout[currentLayout];
        }
        // now that we have our files and variables split files into pages
        let pages = [];
        let perPage = opts.groups[groupIndex].per_page || pageFiles.length; // don't use infinity
        let totalPages = Math.ceil(pageFiles.length / perPage);
        if (totalPages === 0) {
          totalPages = 1;
        }
        for (let i = 0; i < totalPages; i++) {
          // FIXME body should be split, hoping for better readability
          let thisPageFiles = pageFiles.slice(i * perPage, (i + 1) * perPage);
          // get variables for path
          if (i !== 0) {
            pathReplace.num = i + 1;
          } else {
            delete pathReplace.num;
          }
          if (typeof opts.groups[groupIndex].date_format !== 'undefined') {
            pathReplace.date = minigroup;
          }
          if (expose || exposeValue) {
            pathReplace.expose = exposeValue || minigroup;
            pathReplace.expose = makeSafe(pathReplace.expose);
          }
          // create path by replacing variables
          let path = opts.groups[groupIndex].path.replace(/{title}/g, '').replace(/{(.*?)}/g, function (matchPost, matchedGroup) {
            if (typeof pathReplace[matchedGroup] !== 'undefined') {
              if (matchedGroup === 'num' && typeof opts.groups[groupIndex].num_format !== 'undefined') {
                return opts.groups[groupIndex].num_format.replace(/{(.*?)}/g, function (matchPost, matchedGroup) { return pathReplace[matchedGroup]; });
              }
              return pathReplace[matchedGroup];
            } else {
              return '';
            }
          }).replace(/(\/)+/g, '/').replace(/.$/m, match => {
            if (match !== '/') {
              return match + '/';
            } else {
              return match;
            }
          });
          // allows user to change filename
          let filename;
          if (typeof opts.groups[groupIndex].page_only !== 'undefined' &&
            opts.groups[groupIndex].page_only === true &&
            typeof opts.groups[groupIndex].no_folder !== 'undefined' &&
            opts.groups[groupIndex].no_folder === true) {
            filename = '';
            path = path.slice(0, path.length - 1);
          } else {
            filename = 'index';
          }
          // create our page object
          let page = {
            layout: layout,
            group: groupName,
            contents: new Buffer(''),
            pagination: {
              index: pages.length,
              num: pages.length + 1,
              pages: pages,
              files: thisPageFiles,
              total: totalPages
            },
            path: path + filename + extension,
            permalink: '/' + path
          };
          // add exposed and exposed_value to pages that have it
          if (typeof exposeValue !== 'undefined') { // special pages //e.g. expose: tags, tags: post
            page.exposed = expose;
            page.exposed_value = exposeValue;
          } else if (typeof expose !== 'undefined') { // pages which expose all
            page.exposed = expose;
            page.exposed_value = minigroup;
          } else if (minigroup !== 'files') { // dates
            page.exposed = 'dates';
            page.exposed_value = minigroup;
          }
          // adds a page description if it exists
          if (typeof opts.groups[groupIndex].page_description !== 'undefined') {
            page.page_description = opts.groups[groupIndex].page_description;
          }
          // append previous page to pagination
          if (totalPages !== 1 && i !== 0) {
            page.pagination.prev = pages[i - 1];
            pages[i - 1].pagination.next = page;
          }
          // add total number of pages when on last page
          if (page.pagination.num === page.pagination.total) {
            for (let x = 2; x < page.pagination.total + 1; x++) { // don't get last page by starting at 2, but get page 0 by adding 1
              let thispage = page.pagination.total - x;
              pages[thispage].pagination.totalPages_permalink = page.permalink;
            }
            page.pagination.totalPages_permalink = page.permalink;
          }
          returnPage(page, files, pages);
        }
      }
    }

    /**
     * post files
     *
     * @param {any} files
     * @param {any} groupIndex
     * @param {any} groupName
     * @param {any} exposeValue
     * @param {any} expose
     * @param {any} pathReplace
     * @param {any} layout
     * @param {any} extension
     * @returns
     */
    function postParser (files, groupIndex, groupName, exposeValue, expose, pathReplace, layout, extension) {
      // ignore page_only group
      if (typeof opts.groups[groupIndex].page_only !== 'undefined' && opts.groups[groupIndex].page_only === true) {
        return;
      }
      // make sure we're in a permalink group or the group allows overriding
      if (groupName === opts.permalink_group || opts.groups[groupIndex].override_permalink_group === true) {
        for (let post in groups[groupIndex].files) {
          let postpage = Object.assign({}, groups[groupIndex].files[post]); // reference to groupName was being overwritten
          // change path if we want no fodler
          if (typeof opts.groups[groupIndex].no_folder !== 'undefined' && opts.groups[groupIndex].no_folder === true) {
            postpage.path = postpage.permalink.replace(/\/||\\/, '') + extension;
          } else {
            postpage.path = postpage.permalink.replace(/\/||\\/, '') + '/index' + extension;
          }
          // handle pagination of posts
          let next = parseInt(post, 10) + 1;
          if (typeof groups[groupIndex].files[next] !== 'undefined') {
            postpage.pagination = postpage.pagination || {};
            postpage.pagination.next = groups[groupIndex].files[next];
          }
          let prev = parseInt(post, 10) - 1;
          if (prev >= 0 && typeof groups[groupIndex].files[prev] !== 'undefined') {
            postpage.pagination = postpage.pagination || {};
            postpage.pagination.prev = groups[groupIndex].files[prev];
          }
          postpage.group = groupName;
          returnPage(postpage, files);
        }
      }
    }

    /**
     * final function to push to files list
     *
     * @param {any} page
     * @param {any} files
     * @param {any} pages
     */
    function returnPage (page, files, pages) {
      files[page.path] = page;
      if (typeof pages !== 'undefined') {
        pages.push(page);
      }
    }

    done();
  };
}
