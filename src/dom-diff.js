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

/**
 * Sync DOM from source element to target element.
 *
 * TODO: In future, optimize sorting lists (with keys).
 */
// Dumb diff algo that checks nodes of same index
// Time complexity O(n) - where n is lengths of the larger array.
export function diffAndPatch(newNode, targetNode) {
  if (newNode.nodeType !== targetNode.nodeType || (newNode.nodeType === 1 && newNode.nodeName !== targetNode.nodeName)) {
    return targetNode.parentNode.replaceChild(newNode, targetNode);
  }
  // Should only reach here if both nodes are of same type.
  if (newNode.nodeType === 1) { // HTMLElements
    // Sync attributes
    // Remove any attributes not in source
    var i = targetNode.attributes.length - 1, len, attr;
    for (; i >= 0; i -= 1) {
      attr = targetNode.attributes.item(i);
      if (!newNode.attributes.getNamedItem(attr.name)) {
        targetNode.attributes.removeNamedItem(attr.name);
        correctDOMStateForRemovedAttribute(targetNode, attr.name);
      }
    }
    // update the rest
    for (i = 0, len = newNode.attributes.length; i < len; i += 1) {
      attr = newNode.attributes.item(i);
      if (attr.name !== 'value') { // Security: prevent CSS key loggers
        targetNode.setAttribute(attr.name, attr.value); // browser optimizes if update isn't needed.
      }
      correctDOMStateForAddedAttribute(targetNode, attr.name, attr.value);
    }

    // Remove extra nodes
    while (targetNode.childNodes.length > newNode.childNodes.length) {
      targetNode.removeChild(targetNode.lastChild);
    }
    // recursively sync childNodes and their attributes
    for (i = 0, len = newNode.childNodes.length; i < len; i += 1) {
      const newChildNode = newNode.childNodes[i];
      const oldChildNode = targetNode.childNodes[i];
      if (!oldChildNode) {
        targetNode.appendChild(newChildNode)
      } else if (newChildNode !== oldChildNode) {
        // sync required..
        diffAndPatch(newChildNode, oldChildNode);
      }
    }
  } else if (newNode.nodeType === 3 || newNode.nodeType === 8) { // text and comment nodes
    targetNode.nodeValue = newNode.nodeValue;
  }
};
export function render(html, targetNode) {
  const template = document.createElement('template');
  template.innerHTML = html;
  diffAndPatch(template.content.firstElementChild, targetNode);
};
