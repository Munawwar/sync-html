const debug = true;

/**
 * @typedef NodesSlice
 * @property {Comment} startMarker
 * @property {Comment} endMarker
 */

/**
 * @typedef {Node|NodesSlice} NodeGroup
 */

/**
 * @typedef NodesSlice
 * @property {Comment} startMarker
 * @property {Comment} endMarker
 */

/**
 * @typedef AttributeBinding
 * @property {String} type='attr'
 * @property {String} attributeName
 */
/**
 * @typedef NodeBinding
 * @property {String} type='node'
 * @property {Comment} startMarker
 * @property {Comment} endMarker
 */
/**
 * @typedef {AttributeBinding|NodeBinding} Binding
 */

/**
 * @typedef NodeGroupsAndBindings
 * @property {NodeGroup[]} nodeGroups
 * @property {Binding[]} bindings
 */

class Template {
  constructor({ strings, marker, nodeMarker }) {
    /** @type {String} */
    this.strings = strings;
    /** @type {String} */
    this.marker = marker;
    /** @type {String} marker for child nodes */
    this.nodeMarker = nodeMarker;
    /** @type {DocumentFragment|undefined} */
    this.fragment = undefined;
  }

  // on DOM environments
  prepareForDOMEnv() {
    if (!this.fragment) {
      const template = document.createElement('template');
      template.innerHTML = this.strings.join(this.marker);;
      const fragment = template.content;
      this.fragment = fragment;
    }
  }

  /**
   * @returns {NodeGroupsAndBindings}
   */
  getNodeGroupsAndBindings() {
    this.prepareForDOMEnv();
    const fragment = this.fragment.cloneNode(true);

    /** @type {Binding[]} */
    const bindings = [];
    /** @type {NodeGroup[]} */
    const nodeGroups = [];
    // add root nodes to nodes array
    const addIfRootNode = (node) => {
      if (node.parentNode === fragment) {
        nodeGroups.push(node);
      }
    };
    const addNodeGroup = (startMarker, endMarker) => nodeGroups.push(
      /** @type {NodesSlice} */
      {
        startMarker,
        endMarker,
      }
    );

    // traverse template nodes and figure out attribute and child bindings
    let count = 0;
    const treeWalker = document.createTreeWalker(fragment, -1);
    let node = treeWalker.nextNode();
    while (node) {
      count += 1;

      if (node.nodeType === 1) { // Element node
        addIfRootNode(node);

        /** @type Element */
        const element = node;

        // find attribute bindings
        for (const attr of node.attributes) {
          node.value = '';
          if (attr.value === this.marker) {
            bindings.push({
              type: 'attr',
              node,
              attributeName: attr.name,
            });
          }
        }

        // find child node bindings
      } else if (node.nodeType === 8) { // comment node
        if (node.data === this.nodeMarker) {
          const id = String(Math.random() * 1000000 | 0);
          const beforeMarker = document.createComment(String(`${id}-start`));
          node.data = String(`${id}-end`);
          node.parentNode.insertBefore(beforeMarker, node);
          bindings.push({
            type: 'node',
            startMarker: beforeMarker,
            endMarker: node,
          });
          addNodeGroup(beforeMarker, node)
        } else if (node.data.includes(this.marker)) {
          // TODO: support comment nodes some day
          throw new Error('literal-html does not support dynamic html comments');
        } else {
          addIfRootNode(node);
        }
      } else {
        addIfRootNode(node);
      }

      // prepare for next iteration
      node = treeWalker.nextNode();
    }
    return { nodeGroups, bindings };
  }
}

const templateFactory = (() => {
  const markerNumber = String(Math.random() * 1000000 | 0);
  const cache = {};
  return ({ strings }) => {
    const marker = `<![CDATA[${markerNumber}]]>`;
    const nodeMarker = `[CDATA[${markerNumber}]]`;  // child nodes marked will have this data.
    // why? cause if you add <![CDATA[${marker}]]> to HTML document, it becomes a comment
    // node like <!--[CDATA[marker]]-->. When you do node.data you get [CDATA[${marker}]]

    const cacheKey = strings.join('');
    cache[cacheKey] = cache[cacheKey] || new Template({
      strings,
      marker,
      nodeMarker,
    });
    return cache[cacheKey];
  };
})();


/**
 * @param {String[]} strings 
 * @param  {...any} args
 * @returns {View}
 */
export const html = (strings, ...values) => (new View({ strings, values }));

class View {
  /**
   * @param {Object} config
   * @param {String[]} config.strings
   * @param {(String|View|Node|null)[]} config.values
   */
  constructor({ strings, values }) {
    /** @type {Template} */
    this.template = templateFactory({ strings });
    this.values = null;
    this.pendingValues = values;
    /** @type {NodeGroup[]} */
    this.nodeGroups = null;
    /** @type {Binding[]} */
    this.bindings = null;
  }

  // setTemplate(template) {
  //   this.template = template || null;
  //   this.values = null;
  //   this.pendingValues = null;
  //   this.nodeGroups = null;
  //   this.bindings = null;
  // }

  // setValues(values) {
  //   this.pendingValues = values;
  // }

  // one can reuse view only if template is the same
  reuseView(view) {
    if (view.template === this.template) {
      // console.log(view.pendingValues || view.values);
      this.pendingValues = view.pendingValues || view.values;
    }
  }

  prepareForFirstTimeRender() {
    if (!this.nodeGroups) {
      const { nodeGroups, bindings } = this.template.getNodeGroupsAndBindings();
      this.nodeGroups = nodeGroups;
      this.bindings = bindings;
    }
  }

  render({
    /** @type Comment */
    startNode,
    /** @type Comment */
    endNode,
    /** @type Element */
    parentNode,
  } = {}) {
    if (!this.nodeGroups) {
      // console.log('first time render');
      this.prepareForFirstTimeRender();
    }

    // compare pendingValue with this.values and reuse previous views
    // console.log('this.values before value reconcilation', this.values);
    // console.log('this.pendingValues before value reconcilation', this.pendingValues);
    this.values = View.reconcileValues(
      this.values || [],
      this.pendingValues || [],
      this.bindings.length,
    );
    this.pendingValues = null;

    // console.log('this.values', this.values);

    // sync bindings
    for (let index = 0; index < this.bindings.length; index += 1) {
      const binding = this.bindings[index];
      const value = this.values[index];

      if (binding.type === 'attr') {
        const {
          node,
          attributeName,
        } = binding;
        node.attributes[attributeName] = String(value === undefined ? '' : value); // if value is same browser optimizes to not re-render
      } else if (binding.type === 'node') {
        const { startMarker, endMarker } = binding;
        if (value instanceof View) {
          value.render({ startNode: startMarker, endNode: endMarker });
        } else if (Array.isArray(value)) {
          let nodes = [];
          for (const subValue of value) {
            if (value instanceof View) {
              nodes.push(...value.render());
            } else {
              nodes.push(value);
            }
          }
          View.reconcileNodes(nodes, startMarker, endMarker);
        } else {
          // assuming values is a text node or primitive (string/number) at this point
          // console.log('before reconcile', View.getNodesBetween(startMarker, endMarker));
          // debugger;
          View.reconcileNodes([value], startMarker, endMarker);
          // console.log('after reconcile', View.getNodesBetween(startMarker, endMarker));
        }
      }
    }

    // console.log('this.nodeGroups after sync', this.nodeGroups);

    // convert nodeGroups (i.e. skeletal structure) to concrete array of nodes
    const nodes = [];
    for (const item of this.nodeGroups) {
      if (item instanceof Node) {
        nodes.push(item);
      } else { // group of nodes
        nodes.push(...View.getNodesBetween(item.startMarker, item.endMarker));
      }
    }

    if (parentNode) {
      // check for comment markers
      if (!parentNode.firstChild || parentNode.firstChild.nodeType !== 8) {
        // clear content and add comment markers
        parentNode.innerHTML = '<!--p--><!--p-->';
      }
      View.reconcileNodes(nodes, parentNode.firstChild, parentNode.lastChild);
    } else if (startNode || endNode) {
      if (!startNode || !endNode || startNode.nodeType !== 8 || endNode.nodeType !== 8 || startNode === endNode) {
        throw new Error('startNode and endNode must be two distinct HTML comment nodes');
      }
      View.reconcileNodes(nodes, startNode, endNode);
    } else {
      // return copy of "refreshed" nodes ready to be inserted like a DocumentFragment.
      // except that I can't use DocumentFragment as that will unnecessarily disrupt nodes
      // that don't need to be removed.
      return nodes;
    }
  }

  renderToString() {
    const stringParts = [];
    const { strings } = this.template;
    const values = this.pendingValues || this.values;
    for (let index = 0; index < strings.length; index += 1) {
      stringParts.push(strings[index]);
      if (values[index] !== undefined) {
        stringParts.push(values[index]);
      }
    }
    return stringParts.join('');
  }
}

/**
 * Get all nodes between two markers, including markers
 * (markers are siblings / of same parent node and startMarker !== endMarker).
 * @param {Node} startMarker
 * @param {Node} endMarker 
 * @returns {Node[]}
 */
View.getNodesBetween = (startMarker, endMarker) => {
  const childNodes = Array.from(startMarker.parentNode.childNodes);
  const startIndex = childNodes.findIndex(node => node === startMarker);
  const endIndex = childNodes.findIndex(node => node === endMarker);
  return childNodes.slice(startIndex, endIndex + 1);
};

/**
 * Dumb DOM diff of nodes from start node + 1 to end node - 1
 * @param {Node[]} newNodes 
 * @param {Node} startMarker
 * @param {Node} endMarker 
 */
// TODO: In future, optimize sorting lists (with keys).
View.reconcileNodes = (newNodes, startMarker, endMarker) => {
  let currentNode = startMarker.nextSibling;
  let index = 0;
  const toTextNode = (value) => ((value instanceof Node) ? value : document.createTextNode(String(value)));
  while (currentNode && currentNode !== endMarker && index < newNodes.length) {
    const newNode = newNodes[index];
    if (currentNode !== newNode) {
      currentNode.parentNode.replaceChild(toTextNode(newNode), currentNode);
    }
    // prepare for next iteration
    currentNode = currentNode.nextSibling;
    index += 1;
  }
  // remove rest of nodes
  while (currentNode && currentNode !== endMarker) {
    const nodeToRemove = currentNode;
    // prepare for next iteration now.. else removal will cause nextSibling to be null
    currentNode = currentNode.nextSibling;

    startMarker.parentNode.removeChild(nodeToRemove);
  }
  // insert rest of nodes
  while (index < newNodes.length) {
    const newNode = newNodes[index];
    endMarker.parentNode.insertBefore(toTextNode(newNode), endMarker);
    // prepare for next iteration
    index += 1;
  }
};

// reconcile values. though this is implemented recursively, only two level of nested array depth
// is actually supported by render
// TODO: In future, optimize sorting lists (with keys).
View.reconcileValues = (currentValues, pendingValues, maxLength = pendingValues.length) => {
  // compare pendingValue with currentValues and reuse previous views
  const newValues = [];
  for (let index = 0; index < maxLength; index += 1) {
    const oldValue = currentValues[index];
    const newValue = pendingValues[index];

    if (oldValue instanceof View && newValue instanceof View && oldValue.template && oldValue.template === newValue.template) {
      oldValue.reuseView(newValue);
      newValues.push(oldValue);
    } else if (Array.isArray(newValue)) { // for arrays
      if (Array.isArray(oldValue)) {
        newValues.push(View.reconcileValues(oldValue, newValue));
      } else {
        newValues.push(newValue);
      }
    } else { // for Node, primitives etc
      newValues.push(oldValue === newValue ? oldValue : newValue);
    }
  }
  return newValues;
};

/** @type {WeakMap<Node, View>} Start node to view map */
export const cachedViews = new WeakMap();

/**
 * @param {View} view 
 * @param {Node} targetElement 
 */
export function render(view, targetElement) {
  // console.log('------------');
  let existingView = cachedViews.get(targetElement);
  if (existingView) {
    // console.log('found existing view..');
    existingView.reuseView(view);
    existingView.render({ parentNode: targetElement });
  } else {
    view.render({ parentNode: targetElement });
    cachedViews.set(targetElement, view);
  }
  // console.log('------------');
};