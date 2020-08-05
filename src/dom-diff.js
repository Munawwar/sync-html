function correctDOMStateForRemovedAttribute(el, attrName) {
  if (['disabled', 'checked'].includes(attrName)) {
    el[attrName] = false;
  } else if (attrName === 'value') {
    el.value = '';
  }
}

function correctDOMStateForAddedAttribute(el, attrName, attrValue) {
  if (['disabled', 'checked'].includes(attrName)) {
    el[attrName] = true;
  } else if (attrName === 'value') {
    el.value = attrValue;
  }
}

// Dumb diff algo that checks nodes of same index
// Time complexity O(n) - where n is lengths of the larger array.
// n is 'new nodes', o is 'old nodes'
function diff(n, o) {
  var i, j; //i is for n's index and j for o's index

  var changes = [];
  for (i = 0, j = 0; i < n.length && j < o.length; i += 1, j += 1) {
    if (n[i].nodeType === o[j].nodeType && (n[i].nodeType !== 1 || n[i].nodeName === o[j].nodeName)) {
      changes.push({
          replace: true,
          op: 'replace',
          value: n[i],
          index: j
      });
    }
  }
  for (; i < n.length; i += 1) { //if more items from n remains
    changes.push({
      insert : true,
      op: 'insert',
      value: n[i],
      index: i
    });
  }
  for (var end = j; j < o.length; j += 1) { //if more items from o remains
    changes.push({
      remove : true,
      op: 'remove',
      value: o[j],
      index: end
    });
  }

  return changes;
}

function patch(el, changes) {
  changes.forEach(function(change) {
    if (change.replace) {
      el.replaceChild(change.value, el.childNodes[change.index]);
      // o.splice(change.index, 1, change.value);
    } else if (change.insert) {
      el.insertBefore(change.value, el.childNodes[change.index]);
      // o.splice(change.index, 0, change.value);
    } else {
      // o.splice(change.index, 1);
      el.removeChild(el.childNodes[change.index]);
    }
  });
  return el;
}


/**
 * Sync DOM from source element to target element.
 *
 * TODO: In future, optimize sorting lists (with keys).
 */
export function diffAndPatch(sourceNode, targetNode) {
  if (sourceNode.nodeType !== targetNode.nodeType || (sourceNode.nodeType === 1 && sourceNode.nodeName !== targetNode.nodeName)) {
    return targetNode.parentNode.replaceChild(sourceNode, targetNode);
  }
  // Should only reach here if both nodes are of same type.
  if (sourceNode.nodeType === 1) { // HTMLElements
    // Sync attributes
    // Remove any attributes not in source
    var i = targetNode.attributes.length - 1, len, attr;
    for (; i >= 0; i -= 1) {
      attr = targetNode.attributes.item(i);
      if (!sourceNode.attributes.getNamedItem(attr.name)) {
        targetNode.attributes.removeNamedItem(attr.name);
        correctDOMStateForRemovedAttribute(targetNode, attr.name);
      }
    }
    // update the rest
    for (i = 0, len = sourceNode.attributes.length; i < len; i += 1) {
      attr = sourceNode.attributes.item(i);
      if (attr.name !== 'value') { // Security: prevent CSS key loggers
        targetNode.setAttribute(attr.name, attr.value); // browser optimizes if update isn't needed.
      }
      correctDOMStateForAddedAttribute(targetNode, attr.name, attr.value);
    }

    // Sync nodes' type and remove extra nodes.
    var changes = diff(sourceNode.childNodes, targetNode.childNodes);
    // keep copy of source childNodes as patch() would move some DOM elements to target.
    var sourceChildNodes = Array.from(sourceNode.childNodes);
    patch(targetNode, changes);
    // recursively sync their attributes and their childNodes
    for (i = 0, len = sourceChildNodes.length; i < len; i += 1) {
      if (sourceChildNodes[i] !== targetNode.childNodes[i]) {
        diffAndPatch(sourceChildNodes[i], targetNode.childNodes[i]);
      }
    }
  } else if (sourceNode.nodeType === 3 || sourceNode.nodeType === 8) { // text and comment nodes
    targetNode.nodeValue = sourceNode.nodeValue;
  }
};
export function render(html, targetNode) {
  const template = document.createElement('template');
  template.innerHTML = html;
  diffAndPatch(template.content.firstElementChild, targetNode);
};
