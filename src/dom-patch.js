let {render, diffAndPatch} = (() => {  
  /**
   * Sync DOM from source element to target element.
   * Naive algo that syncs nodes of same index
   * Time complexity O(N) - where N is lengths of the larger array's total nodes (including sub-tree of nodes).
   */
  let diffAndPatch = (newNode, targetNode) => {
    if (newNode === targetNode) return;
    let { nodeType: newNodeType } = newNode;
    if (
      newNodeType !== targetNode.nodeType ||
      (newNodeType === 1 && newNode.nodeName !== targetNode.nodeName)
    ) {
      return targetNode.parentNode.replaceChild(newNode, targetNode);
    }
    // Should only reach here if both nodes are of same type.
    if (newNodeType === 1) { // HTMLElements
      // Sync attributes
      // Remove any attributes not in source
      let i = targetNode.attributes.length - 1, len, attr;
      for (; i >= 0; i -= 1) {
        attr = targetNode.attributes.item(i);
        if (!newNode.attributes.getNamedItem(attr.name)) {
          targetNode.attributes.removeNamedItem(attr.name);
        }
      }
      // update the rest
      for (i = 0, len = newNode.attributes.length; i < len; i += 1) {
        attr = newNode.attributes.item(i);
        if (targetNode.getAttribute(attr.name) !== attr.value) {
          targetNode.setAttribute(attr.name, attr.value); // browser optimizes if update isn't needed.
        }
      }

      // Remove extra child nodes
      while (targetNode.childNodes.length > newNode.childNodes.length) {
        targetNode.removeChild(targetNode.lastChild);
      }
      // recursively sync childNodes and their attributes
      for (i = 0, len = newNode.childNodes.length; i < len; i += 1) {
        let newChildNode = newNode.childNodes[i];
        let oldChildNode = targetNode.childNodes[i];
        if (!oldChildNode) {
          targetNode.appendChild(newChildNode);
        } else {
          // sync required..
          diffAndPatch(newChildNode, oldChildNode);
        }
      }
    } else if (newNodeType === 3 || newNodeType === 8) { // text and comment nodes
      if (targetNode.nodeValue !== newNode.nodeValue) {
        targetNode.nodeValue = newNode.nodeValue;
      }
    }
  };
  let render = (html, targetNode) => {
    let template = document.createElement('template');
    template.innerHTML = html;
    diffAndPatch(template.content.firstElementChild, targetNode);
  };

  return { render, diffAndPatch };
})();

export { render, diffAndPatch };