const moment = require('moment');

module.exports = plugin;

function plugin (opts) {
  // SORT OPTIONS

  // all our exempted properties
  const exceptions = ['groupName', 'path', 'override_permalinkGroup', 'page_layout', 'date_page_layout', 'expose', 'date_format', 'perPage', 'page_description', 'num_format', 'reverse', 'no_folder', 'searchType', 'add_prop', 'change_extension', 'page_only'];
  if (typeof opts.drafts === 'undefined') {
    opts.drafts = false;
  }
  // create list for documentation
  // console.log("`"+exceptions.sort().join("`, `")+"`");

  // define global search type if none given.
  opts.searchType = opts.searchType || 'all';

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
  // UTILITIES

  // the default make_save function for titles, does not apply to slugs (on purpose)
  const defaultSafe = function (string) {
    return string.replace(/(-|\/)/g, '').replace(/('|"|\(|\)|\[|\]|\?|\+)/g, '').replace(/(\s)+/g, '-').toLowerCase();
  };
  // let user override
  const makeSafe = typeof opts.makeSafe !== 'undefined' ? opts.makeSafe : defaultSafe;

  function getGroupIndex (groupName) {
    for (let groupIndex in opts.groups) {
      if (opts.groups[groupIndex].groupName === groupName) {
        return groupIndex;
      }
    }
  }
  // for assigning date data to metalsmith_.metadata
  function assignPath (obj, path, value) {
    const last = path.length - 1;
    for (let i = 0; i < last; i++) {
      const key = path[i];
      if (typeof obj[key] === 'undefined') {
        obj[key] = {};
      }
      obj = obj[key];
    }
    obj[path[last]] = value;
    // return obj
  }
  // sort function for group dates
  function order (a, b) {
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
        var searchType = typeof opts.groups[groupIndex].searchType !== 'undefined' ? opts.groups[groupIndex].searchType : opts.searchType;
        // check if post matches criteria then send the post to sort if it does
        if (match(post, groupIndex, searchType)) {
          sortPost(groups, groupIndex, file, post);
        }
      }
    }

    // returns whether a post matches our criteria or not
    function match (data, groupIndex, searchType) {
      const search = opts.groups[groupIndex].search;
      let match = true;
      if (search.length === 0) {
        return match;
      }
      for (let property in search) {
        var propertyname = Object.keys(search[property]);
        var propertyvalue = search[property][propertyname];
        if (searchType === 'all') {
          if (contains(data[propertyname], propertyvalue) && match !== false) {
            match = true;
          } else { match = false; }
        } else if (searchType === 'any') {
          match = false;
          if (contains(data[propertyname], propertyvalue)) {
            match = true;
            break;
          }
        }
      }
      return match;
    }

    // checks individual values of post and returns whether there's a match to the match function
    function contains (data, propertyVal) {
      if (typeof propertyVal === 'boolean') { // for when we just want to check if a property exists
        if (propertyVal === true && typeof data !== 'undefined') {
          return true;
        } else if (propertyVal === true && typeof data === 'undefined') {
          return false;
        } else if (propertyVal === false && typeof data === 'undefined') {
          return true;
        } else if (propertyVal === false && typeof data !== 'undefined') {
          return false;
        }
      }
      if (typeof data !== 'undefined') { // for checking strings and arrays against our search criteria values
        if (typeof data === 'string' && makeSafe(data) === makeSafe(propertyVal)) {
          return true;
        }
        if (Array.isArray(data)) {
          data = data.map(tag => {
            tag = makeSafe(String(tag).trim());
            return tag;
          });
          return data.includes(makeSafe(propertyVal));
        }
      }
    }

    // once we know a post matches our criteria it's sorted into the right group
    function sortPost (groups, groupIndex, file, post) {
      var expose = opts.groups[groupIndex].expose;
      var exposeValue = opts.groups[groupIndex][expose];
      if (expose) {
        if (typeof exposeValue === 'undefined') { // e.g. expose:tags but no specific tag defined, it'll expose all
          for (let property in post[expose]) { // no need to get list of tags, for each tag in post it's "pushed" to it's tags
            pushToGroup(groups, groupIndex, file, post, post[expose][property]);
          }
        } else {
          pushToGroup(groups, groupIndex, file, post, exposeValue); // e.g. expose: tags, tags: post
        }
      } else {
        pushToGroup(groups, groupIndex, file, post); // don't expose anything
      }
    }

    // from sortPost we actually push to our empty group array
    function pushToGroup (groups, groupIndex, file, post, expose) {
      var groupName = opts.groups[groupIndex].groupName;
      if (typeof post.title === 'undefined') {
        throw new Error('File ' + file + ' missing title. If the file has a title, make sure the frontmatter is formatted correctly.');
      }
      post.original_contents = new Buffer(post.contents.toString());
      // sort out the path for the post
      let pathreplace = {};
      if (typeof post.slug !== 'undefined') {
        pathreplace.title = post.slug; // do not makeSafe the slug on purpose
      } else {
        pathreplace.title = makeSafe(post.title);
      }
      // normal groups
      if (typeof post.permalink === 'undefined') { // because the object is just being referenced, it might have already been set
        let permalinkGroup = getGroupIndex(opts.permalinkGroup);
        pathreplace.group = groupName;
        if (typeof opts.groups[permalinkGroup].date_format !== 'undefined') {
          pathreplace.date = moment(post.date).format(opts.groups[permalinkGroup].date_format);
        }
        post.permalink = '/' + opts.groups[permalinkGroup].path.replace(/\/{num}/g, '').replace(/{(.*?)}/g, function (match, matchedGroup) {
          return pathreplace[matchedGroup];
        });
      }
      // groups that override the permalink
      if (typeof opts.groups[groupIndex].override_permalinkGroup !== 'undefined') {
        let path;
        pathreplace.group = groupName;
        if (typeof opts.groups[groupIndex].override_permalinkGroup.date_format !== 'undefined') {
          pathreplace.date = moment(post.date).format(opts.groups[groupIndex].override_permalinkGroup.date_format);
        }
        if (typeof opts.groups[groupIndex].path === 'undefined') {
          path = '{group}/{title}';
        } else {
          path = opts.groups[groupIndex].path;
        }
        post.permalink = '/' + path.replace(/\/{num}/g, '').replace(/{(.*?)}/g, function (match, matchedGroup) {
          return pathreplace[matchedGroup];
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
          let initial = 1;
          for (let i = 0; i < dateItems.length; i++) {
            let format = dateItems.slice(0, initial).join('/');
            let dategroup = moment(post.date).format(format);
            groups[groupIndex].dates = groups[groupIndex].dates || {};
            groups[groupIndex].dates[dategroup] = groups[groupIndex].dates[dategroup] || {};
            groups[groupIndex].dates[dategroup].files = groups[groupIndex].dates[dategroup].files || [];
            groups[groupIndex].dates[dategroup].files.push(post);
            initial++;
          }
        }
        groups[groupIndex].files = groups[groupIndex].files || [];
        groups[groupIndex].files.push(post);
      }
    }
    // end of pushToGroup

    // once we have out new group object sort it by date if necessary
    for (let groupIndex in groups) {
      var expose = opts.groups[groupIndex].expose;
      if (expose) {
        for (expose in groups[groupIndex]) {
          groups[groupIndex][expose].files = groups[groupIndex][expose].files.map(post => {
            return post;
          }).sort(order);
        }
      } else {
        // console.log(typeof groups[groups].files == "undefined")
        if (typeof groups[groupIndex].files !== 'undefined') { // don't overwrite exposed groups
          groups[groupIndex].files = groups[groupIndex].files.map(post => {
            return post;
          }).sort(order);
        }
      }
    }
    // delete original file list
    for (let file in files) {
      delete files[file];
    }

    // with our new groups array go through them and push our final files to our files list
    for (let groupIndex in groups) {
      var expose = opts.groups[groupIndex].expose;
      var exposeValue = opts.groups[groupIndex][expose];
      var pathreplace = {group: opts.groups[groupIndex].groupName};
      var groupName = opts.groups[groupIndex].groupName;
      var layout = opts.groups[groupIndex].page_layout || 'index';
      var extension = typeof opts.groups[groupIndex].change_extension !== 'undefined' ? opts.groups[groupIndex].change_extension : '.html';
      pageParser(files);
      postParser(files);
    }

    // for pages
    function pageParser () {
      // return when path does not allow page to be made or when we're in the permalink group
      if (opts.groups[groupIndex].path === '{title}' ||
        (groupName === opts.permalinkGroup && opts.groups[groupIndex].override_permalinkGroup === false)) {
        return;
      }
      // set largegroup to more clearly understand what's being iterated over
      var largegroup = groups[groupIndex];
      if (typeof largegroup.dates !== 'undefined') {
        largegroup = largegroup.dates;
      }
      for (let minigroup in largegroup) {
        // determines where exactly the files are
        if (typeof largegroup[exposeValue] !== 'undefined') { // exposed value
          var pageFiles = largegroup[exposeValue].files;
        } else if (typeof largegroup[minigroup] !== 'undefined' && minigroup !== 'files') { // dates
          var pageFiles = largegroup[minigroup].files;
        } else { // normal pages
          var pageFiles = largegroup.files;
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
            assignPath(metalsmith._metadata.site.dates, dateItems, {date: minigroup, count: count, files: pageFiles});
          }
          // layout
          var dateLayout = opts.groups[groupIndex].date_page_layout.split('/');
          var current_layout = minigroup.split('/').length - 1;
          layout = dateLayout[current_layout];
        }
        // now that we have our files and variables split files into pages
        var pages = [];
        var perPage = opts.groups[groupIndex].perPage || pageFiles.length; // don't use infinity
        var totalPages = Math.ceil(pageFiles.length / perPage);
        if (totalPages === 0) { totalPages = 1; }
        for (let i = 0; i < totalPages; i++) {
          var thisPageFiles = pageFiles.slice(i * perPage, (i + 1) * perPage);
          // get variables for path
          if (i !== 0) {
            pathreplace.num = i + 1;
          } else {
            delete pathreplace.num;
          }
          if (typeof opts.groups[groupIndex].date_format !== 'undefined') {
            pathreplace.date = minigroup;
          }
          if (expose || exposeValue) {
            pathreplace.expose = exposeValue || minigroup;
            pathreplace.expose = makeSafe(pathreplace.expose);
          }
          // create path by replacing variables
          let path = opts.groups[groupIndex].path.replace(/{title}/g, '').replace(/{(.*?)}/g, function (match, matchedGroup) {
            if (typeof pathreplace[matchedGroup] !== 'undefined') {
              if (matchedGroup === 'num' && typeof opts.groups[groupIndex].num_format !== 'undefined') {
                return opts.groups[groupIndex].num_format.replace(/{(.*?)}/g, function (match, matchedGroup) { return pathreplace[matchedGroup]; });
              }
              return pathreplace[matchedGroup];
            } else { return ''; }
          }).replace(/(\/)+/g, '/').replace(/.$/m, match => {
            if (match !== '/') {
              return match + '/';
            } else {
              return match;
            }
          });
          // allows user to change filename
          if (typeof opts.groups[groupIndex].page_only !== 'undefined' && opts.groups[groupIndex].page_only === true && typeof opts.groups[groupIndex].no_folder !== 'undefined' && opts.groups[groupIndex].no_folder === true) {
            var filename = '';
            path = path.slice(0, path.length - 1);
          } else {
            var filename = 'index';
          }
          // create our page object
          var page = {
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
    // post files
    function postParser () {
      // ignore pages_only group
      if (typeof opts.groups[groupIndex].page_only !== 'undefined' && opts.groups[groupIndex].page_only === true) {
        return;
      }
      // make sure we're in a permalink group or the group allows overriding
      if (groupName === opts.permalinkGroup || opts.groups[groupIndex].override_permalinkGroup === true) {
        for (let forpost in groups[groupIndex].files) {
          var postpage = Object.assign({}, groups[groupIndex].files[post]); // reference to groupName was being overwritten
          // change path if we want no fodler
          if (typeof opts.groups[groupIndex].no_folder !== 'undefined' && opts.groups[groupIndex].no_folder == true) {
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
