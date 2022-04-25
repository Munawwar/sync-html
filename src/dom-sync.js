// @ts-check
/**
 * Problem statement: I got to sync live DOM nodes using a list of DOM nodes as reference.
 * 
 * Why can't I use existing solutions?
 * The nodes in the new list may look identical but strict equality check would never
 * be true (as they are indeed new nodes). solutions like udomdiff does strict equality.
 * I need a similarity check based diff & patch.
 * 
 * Aim:
 * 1. Don't naively throw out all existing DOM nodes while patching
 * 2. Acceptable performance O(N). N = total number of nodes of subtree.
 * This is different from udomdiff where O(n), n = length of new nodes, which is
 * lesser than subtree nodes.
 */

(function () {
	// utils
	var arrayProto = Array.prototype;
	function from(arrayLike) {
		return arrayProto.slice.call(arrayLike);
	}
	function each(arrayLike, fn) {
		return arrayProto.forEach.call(arrayLike, fn);
	}
	function isCustomElement(element) {
		if (element.tagName.indexOf('-') > 0) return true;
		var attr = element.getAttribute('is');
		return (attr && attr.indexOf('-') > 0);
	}

	/**
	 * @param {Element} newNode
	 * @param {Element} liveNode
	 */
	function syncAttributes(newNode, liveNode) {
		// Remove any attributes from live node that is not in new node
		each(liveNode.attributes, function (attr) {
			if (!newNode.attributes.getNamedItem(attr.name)) {
				liveNode.attributes.removeNamedItem(attr.name);
			}
		});

		// update the rest
		each(newNode.attributes, function (attr) {
			if (liveNode.getAttribute(attr.name) !== attr.value) {
				liveNode.setAttribute(attr.name, attr.value);
			}
		});
	}

	function getCustomElementOuterHtml(el) {
		var parts = ['<', el.nodeName];
		each(el.attributes, function (attr) {
			parts.push(' ', attr.name, '=', JSON.stringify(attr.value));
		});
		parts.push('/>');
		return parts.join('');
	}
	/**
	 * 
	 * @param {Node} node 
	 * @param {WeakMap<Node, string>} cache 
	 * @returns {string}
	 */
	function hashNode(node, cache) {
		var hash = cache.get(node);
		if (!hash) {
			hash = node.nodeType + ':' + (
				(node.nodeType === 1 ?
					(
						isCustomElement(node) ?
						getCustomElementOuterHtml(node) :
						/** @type {Element} */ (node).outerHTML
					) :
					// comment, text, cdata node
					node.nodeValue
				)
			);
			cache.set(node, hash);
		}
		return hash;
	}

	/**
	 * Assumptions:
	 * 1. liveNodes are child nodes of parentNode
	 * 2. no duplicates allowed within newNodes
	 * 3. no duplicates allowed within liveNodes
	 * 4. neither list should contain `after` node or any node before `after` node
	 * @param {Node[]} newNodes
	 * @param {Node[]} liveNodes
	 * @param {Node} parentNode
	 * @param {Node} [after] sync nodes after a specified node, so that the nodes before it doesn't get touched
	 */
	function patchDom(newNodes, liveNodes, parentNode, after) {

		// fast path: case if newNodes.length is zero. means remove all
		if (!newNodes.length) {
			liveNodes.forEach(node => parentNode.removeChild(node));
			return;
		}

		/** @type {WeakMap<Node, string>} */
		var nodeHashCache = new WeakMap();

		/**
		 * @typedef DomInfo
		 * @property {Node[]} u unmatched
		 * @property {Map<Node, Node>} n2l new node to live lookup
		 * @property {Map<Node, Node>} l2n live node to new lookup
		 */
		/**
		 * Map from new nodes to old and back if available
		 * @type {Record<string, DomInfo>}
		 */
		var domLookup = {};
		newNodes.forEach(function (newNode) {
			var hash = hashNode(newNode, nodeHashCache);
			domLookup[hash] = domLookup[hash] || {
				u: [],
				n2l: new Map(),
				l2n: new Map(),
			};
			domLookup[hash].u.push(newNode);
		});
		var numberOfMatches = 0;
		/**
		 * we later want to re-use elements that don't have exact match if we can
		 * @type {Record<string, Element[]>}
		 */
		var salvagableElements = {};
		liveNodes.forEach(function (liveNode) {
			var hash = hashNode(liveNode, nodeHashCache);
			var entry = domLookup[hash];
			var matched = false;
			if (entry) {
				var newNode = entry.u.shift(); // pick first match
				if (newNode) {
					entry.n2l.set(newNode, liveNode);
					entry.l2n.set(liveNode, newNode);
					matched = true;
					numberOfMatches++;
				}
			}
			if (!matched && liveNode.nodeType === 1) {
				salvagableElements[liveNode.nodeName] = salvagableElements[liveNode.nodeName] || [];
				salvagableElements[liveNode.nodeName].push(/** @type {Element} */ (liveNode));
			}
		});

		// optimization for removals
		// if all new nodes have matching live nodes, then we can safely
		// remove remaining (non-matching) live nodes before re-ordering
		// so if live nodes are already in order (as in the case of many
		// conditional rendering), re-ordering will be a no-op.
		if (numberOfMatches === newNodes.length && liveNodes.length > newNodes.length) {
			// remove from end so that it doesn't affect iteration
			for (var i = liveNodes.length - 1; i>= 0; i--) {
				var liveNode = liveNodes[i];
				var hash = hashNode(liveNode, nodeHashCache);
				if (!domLookup[hash] || !domLookup[hash].l2n.has(liveNode)) {
					// remove from live DOM and from liveNodes list
					parentNode.removeChild(liveNode);
					liveNodes.splice(i, 1);
				}
			}
		}

		// figure out where to start syncing from
		var insertAt = from(parentNode.childNodes).indexOf(after) + 1;
		var newLiveNodes = new Set();

		// re-ordering
		// we now look at new nodes top-to-bottom and order them exactly at it's final index
		newNodes.forEach(function (newNode, index) {
			// check for exact match live node
			var hash = hashNode(newNode, nodeHashCache);
			var existingLiveNode = domLookup[hash].n2l.get(newNode);
			var nodeAtPosition = parentNode.childNodes[insertAt + index];
			if (existingLiveNode) {
				newLiveNodes.add(existingLiveNode);
				// put it at the position. If nodeAtPosition is undefined, then inserts to end
				if (nodeAtPosition !== existingLiveNode) {
					parentNode.insertBefore(existingLiveNode, nodeAtPosition);
				}
				// else nothing to do if exact match is already at the right position
				return;
			}
			
			// at this point we don't have an exact match node.
			// So for text, comment nodes just use the new nodes.
			// But for elements we can potentially re-use an existing element
			//
			// why? because there is a likely hood the node to be updated is a
			// "similar looking" element.
			// e.g. if the only update was an attribute update, and that node
			// happens to be a input element, it is worth keeping it so that
			// user doesn't potentially lose focus

			var newNodeName = newNode.nodeName;
			if (
				newNode.nodeType !== 1
				|| !salvagableElements[newNodeName]
				|| !salvagableElements[newNodeName].length
			) {
				newLiveNodes.add(newNode);
				parentNode.insertBefore(newNode, nodeAtPosition);
				return;
			}
			
			// at this point we have an element that doesn't have an exact matching node.
			// but we do have an existing element of same nodeType that can be re-used
			var newEl = /** @type {Element} */ (newNode); // gah, typescript!
			var aLiveNode = salvagableElements[newNodeName].shift(); // pick first one
			newLiveNodes.add(aLiveNode);
			// place it at where the new node should be
			if (nodeAtPosition !== aLiveNode) {
      	parentNode.insertBefore(aLiveNode, nodeAtPosition);
			}
			syncAttributes(newEl, aLiveNode);
			// recursively sync children, except for custom elements (because encapsulation
			// - reactivity with CE is via attributes only)
			if (!isCustomElement(newEl)) {
				patchDom(
					Array.from(newEl.childNodes),
					Array.from(aLiveNode.childNodes),
					aLiveNode,
				);
			}
		});

		// now remove any element not in newLiveNodes
		liveNodes.forEach(function (node) {
			if (!newLiveNodes.has(node)) {
				parentNode.removeChild(node);
			}
		});
	};

	// @ts-ignore
	window.patchDom = patchDom;
})();