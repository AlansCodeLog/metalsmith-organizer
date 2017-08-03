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

  // get search criteria for each group
  for (let groupIndex in opts.groups) {
    opts.groups[groupIndex].search = Object.keys(opts.groups[groupIndex]).map(criteria => {
      if (!exceptions.includes(criteria)) { // add new non-search options here
        const obj = {};
        obj[criteria] = opts.groups[groupIndex][criteria];
        return obj;
      }
    }).filter(property => { return typeof property !== 'undefined'; });
  }

  // the default make_safe function for titles, does not apply to slugs (on purpose)
  const defaultMakeSafe = function (string) {
    return string.replace(/(-|\/)/g, '').replace(/('|"|\(|\)|\[|\]|\?|\+)/g, '').replace(/(\s)+/g, '-').toLowerCase();
  };
  // let user override
  const makeSafe = (typeof opts.make_safe === 'function') ? opts.make_safe : defaultMakeSafe;

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

    for (let file in files) {
      let post = files[file];
      for (let groupIndex in opts.groups) {
        // if draft check
        if (opts.drafts === false && (post.draft === true || post.draft === 'true' || post.published === false || post.published === 'false' || post.status === 'draft')) {
          continue;
        }
        // see if post specifies searchType
        let searchType = typeof opts.groups[groupIndex].search_type !== 'undefined' ? opts.groups[groupIndex].search_type : opts.search_type;
        // check if post matches criteria then send the post to sort if it does
        if (matchPost(post, groupIndex, searchType)) {
          sortPost(groups, groupIndex, file, post);
        }
      }
    }

    // once we have out new group object sort it by date if necessary
    for (let groupIndex in groups) {
      let expose = opts.groups[groupIndex].expose;
      if (expose) {
        // FIXME variable shadowing, shouldn't happening
        for (expose in groups[groupIndex]) {
          groups[groupIndex][expose].files = groups[groupIndex][expose].files.map(post => {
            return post;
          }).sort(_order);
        }
      } else {
        // console.log(typeof groups[groups].files == "undefined")
        if (typeof groups[groupIndex].files !== 'undefined') { // don't overwrite exposed groups
          groups[groupIndex].files = groups[groupIndex].files.map(post => {
            return post;
          }).sort(_order);
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

    /**
     * returns whether a post matches our criteria or not
     *
     * @param {Object} data the data associated to a parsed file
     * @param {Number} groupIndex the index of the current group
     * @param {String} searchType can either be `all` or `any`
     * @returns {Boolean}
     */
    function matchPost (data, groupIndex, searchType) {
      const search = opts.groups[groupIndex].search;
      let match = false;
      // we include all posts by default if no search has been defined in the options
      if (search.length === 0) {
        return true;
      }
      for (let propIndex = 0; propIndex < search.length; propIndex++) {
        let propertyName = Object.keys(search[propIndex]);
        let propertyValue = search[propIndex][propertyName];

        if (searchType === 'all') {
          // FIXME will never get into the following block if `match` is `false`
          if (contains(data[propertyName], propertyValue) && match !== false) {
            match = true;
          } else {
            match = false;
          }
        } else if (searchType === 'any') {
          match = false;

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
     * once we know a post matches our criteria it's sorted into the right group
     *
     * @param {any} groups
     * @param {Number} groupIndex
     * @param {any} file
     * @param {any} post
     */
    function sortPost (groups, groupIndex, file, post) {
      const expose = opts.groups[groupIndex].expose;
      const exposeValue = opts.groups[groupIndex][expose];

      if (expose) {
        if (typeof exposeValue === 'undefined') { // e.g. expose:tags but no specific tag defined, it'll expose all
          for (let property in post[expose]) { // no need to get list of tags, for each tag in post it's "pushed" to its tags
            pushToGroup(groups, groupIndex, file, post, post[expose][property]);
          }
        } else {
          pushToGroup(groups, groupIndex, file, post, exposeValue); // e.g. expose: tags, tags: post
        }
      } else {
        pushToGroup(groups, groupIndex, file, post); // don't expose anything
      }
    }

    /**
     * from sortPost we actually push to our empty group array
     *
     * @param {any} groups
     * @param {Number} groupIndex
     * @param {any} file
     * @param {any} post
     * @param {any} expose
     */
    function pushToGroup (groups, groupIndex, file, post, expose) {
      const groupName = opts.groups[groupIndex].group_name;
      if (typeof post.title === 'undefined') {
        throw new Error('File ' + file + ' missing title. If the file has a title, make sure the frontmatter is formatted correctly.');
      }
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
        const permalinkGroup = _getGroupIndex(opts.permalink_group);
        pathReplace.group = groupName;
        if (typeof opts.groups[permalinkGroup].date_format !== 'undefined') {
          pathReplace.date = moment(post.date).format(opts.groups[permalinkGroup].date_format);
        }
        post.permalink = '/' + opts.groups[permalinkGroup].path.replace(/\/{num}/g, '').replace(/{(.*?)}/g, function (matchPost, matchedGroup) {
          return pathReplace[matchedGroup];
        });
      }
      // groups that override the permalink
      if (typeof opts.groups[groupIndex].override_permalink_group !== 'undefined') {
        let path;
        pathReplace.group = groupName;
        if (typeof opts.groups[groupIndex].override_permalink_group.date_format !== 'undefined') {
          pathReplace.date = moment(post.date).format(opts.groups[groupIndex].override_permalink_group.date_format);
        }
        if (typeof opts.groups[groupIndex].path === 'undefined') {
          path = '{group}/{title}';
        } else {
          path = opts.groups[groupIndex].path;
        }
        post.permalink = '/' + path.replace(/\/{num}/g, '').replace(/{(.*?)}/g, function (matchPost, matchedGroup) {
          return pathReplace[matchedGroup];
        });
      }
      // add any properties specified
      if (typeof opts.groups[groupIndex].add_prop !== 'undefined') {
        for (let set in opts.groups[groupIndex].add_prop) {
          const prop = Object.keys(opts.groups[groupIndex].add_prop[set])[0];
          post[prop] = opts.groups[groupIndex].add_prop[set][prop];
        }
      }
      // actually push to group
      groups[groupIndex] = groups[groupIndex] || {};
      if (expose) {
        groups[groupIndex][expose] = groups[groupIndex][expose] || {};
        groups[groupIndex][expose].files = groups[groupIndex][expose].files || [];
        groups[groupIndex][expose].files.push(post);
      } else {
        if (typeof opts.groups[groupIndex].date_format !== 'undefined') {
          let dateItems = opts.groups[groupIndex].date_format;
          dateItems = dateItems.split('/');
          for (let i = 1; i <= dateItems.length; i++) {
            let format = dateItems.slice(0, i).join('/');
            let dategroup = moment(post.date).format(format);
            groups[groupIndex].dates = groups[groupIndex].dates || {};
            groups[groupIndex].dates[dategroup] = groups[groupIndex].dates[dategroup] || {};
            groups[groupIndex].dates[dategroup].files = groups[groupIndex].dates[dategroup].files || [];
            groups[groupIndex].dates[dategroup].files.push(post);
          }
        }
        groups[groupIndex].files = groups[groupIndex].files || [];
        groups[groupIndex].files.push(post);
      }
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

    // final function to push to files list
    function returnPage (page, files, pages) {
      files[page.path] = page;
      if (typeof pages !== 'undefined') {
        pages.push(page);
      }
    }

    done();
  };
}
